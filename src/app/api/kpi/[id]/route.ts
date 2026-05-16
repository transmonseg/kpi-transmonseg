import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { KpiLinha } from '@/lib/types/kpi'
import { joinObsTexts } from '@/lib/kpi/anomalia-obs'

export const runtime = 'nodejs'

type ParadaJson = {
  loja_id: string | null
  nome: string
  chegada: string
  saida: string
  duracao_min: number
  classificacao: string
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await params
  const svc = createServiceClient()

  const { data: kpi, error: kpiErr } = await svc
    .from('kpis')
    .select('*')
    .eq('id', id)
    .single()

  if (kpiErr || !kpi) return new NextResponse('KPI não encontrado', { status: 404 })

  // Buscar rotas pertencentes a este KPI (kpi_rotas se relaciona a kpi via data+rede_id).
  const { data: rotasDoKpi } = await svc
    .from('kpi_rotas')
    .select('id, escala_linha_id, placa_norm, saida_cd, paradas_json, anomalias_codigos, escala_linhas(motorista_nome, loja_nome_raw, carro_ordem)')
    .eq('data', kpi.data)
    .eq('rede_id', kpi.rede_id)
  const rotaIds = (rotasDoKpi ?? []).map((r) => r.id as string)

  // Map de escala_linha_id → anomalias_codigos vindos de kpi_rotas
  const codigosMap = new Map<string, string[]>(
    (rotasDoKpi ?? []).map((r) => [
      r.escala_linha_id as string,
      (r.anomalias_codigos as string[] | null) ?? [],
    ])
  )

  const { data: linhasRaw } = await svc
    .from('kpi_linhas')
    .select('*')
    .eq('kpi_id', id)
    .order('ordem')

  let linhas: KpiLinha[]

  if ((linhasRaw ?? []).length > 0) {
    // kpi_linhas já populado (após gerar)
    linhas = (linhasRaw ?? []).map(r => ({
      kpi_id: r.kpi_id,
      escala_linha_id: r.escala_linha_id,
      ordem: r.ordem,
      loja_nome: r.loja_nome,
      motorista: r.motorista,
      placa: r.placa,
      carro_ordem: r.carro_ordem as 1 | 2,
      saida_cd: r.saida_cd ? new Date(r.saida_cd) : null,
      chd_loja_1: r.chd_loja_1 ? new Date(r.chd_loja_1) : null,
      saida_loja_1: r.saida_loja_1 ? new Date(r.saida_loja_1) : null,
      tempo_loja_1_min: r.tempo_loja_1_min,
      chd_loja_2: r.chd_loja_2 ? new Date(r.chd_loja_2) : null,
      saida_loja_2: r.saida_loja_2 ? new Date(r.saida_loja_2) : null,
      tempo_loja_2_min: r.tempo_loja_2_min,
      chd_loja_3: r.chd_loja_3 ? new Date(r.chd_loja_3) : null,
      saida_loja_3: r.saida_loja_3 ? new Date(r.saida_loja_3) : null,
      tempo_loja_3_min: r.tempo_loja_3_min,
      observacao: r.observacao,
      anomalias_codigos: codigosMap.get(r.escala_linha_id as string) ?? [],
    }))
  } else {
    // Fallback: monta linhas direto de kpi_rotas (antes do gerar)
    linhas = (rotasDoKpi ?? [])
      .sort((a, b) => {
        const nomeA = (a.escala_linhas as { loja_nome_raw?: string } | null)?.loja_nome_raw ?? ''
        const nomeB = (b.escala_linhas as { loja_nome_raw?: string } | null)?.loja_nome_raw ?? ''
        const cmp = nomeA.localeCompare(nomeB)
        if (cmp !== 0) return cmp
        const caA = (a.escala_linhas as { carro_ordem?: number } | null)?.carro_ordem ?? 1
        const caB = (b.escala_linhas as { carro_ordem?: number } | null)?.carro_ordem ?? 1
        return caA - caB
      })
      .map((rota, idx) => {
        const escala = rota.escala_linhas as { motorista_nome?: string | null; loja_nome_raw?: string; carro_ordem?: number } | null
        const paradas = (rota.paradas_json ?? []) as ParadaJson[]
        const carroOrdem = (escala?.carro_ordem ?? 1) as 1 | 2
        let motorista = escala?.motorista_nome ?? null
        if (carroOrdem === 2 && motorista) motorista = `(2º CARRO) ${motorista}`
        const p1 = paradas[0] ?? null
        const p2 = paradas[1] ?? null
        const p3 = paradas[2] ?? null
        const codigos = (rota.anomalias_codigos as string[] | null) ?? []
        return {
          kpi_id: id,
          escala_linha_id: rota.escala_linha_id as string,
          ordem: idx + 1,
          loja_nome: escala?.loja_nome_raw ?? '',
          motorista,
          placa: rota.placa_norm as string | null,
          carro_ordem: carroOrdem,
          saida_cd: rota.saida_cd ? new Date(rota.saida_cd as string) : null,
          chd_loja_1: p1 ? new Date(p1.chegada) : null,
          saida_loja_1: p1 ? new Date(p1.saida) : null,
          tempo_loja_1_min: p1?.duracao_min ?? null,
          chd_loja_2: p2 ? new Date(p2.chegada) : null,
          saida_loja_2: p2 ? new Date(p2.saida) : null,
          tempo_loja_2_min: p2?.duracao_min ?? null,
          chd_loja_3: p3 ? new Date(p3.chegada) : null,
          saida_loja_3: p3 ? new Date(p3.saida) : null,
          tempo_loja_3_min: p3?.duracao_min ?? null,
          observacao: joinObsTexts(codigos) || null,
          anomalias_codigos: (rota.anomalias_codigos as string[] | null) ?? [],
        } satisfies KpiLinha
      })
  }

  const anomaliasRows = rotaIds.length === 0 ? [] : await svc
    .from('anomalias')
    .select('id, codigo, severidade, descricao, sugestao, status, kpi_rota_id, parada_id')
    .in('kpi_rota_id', rotaIds)
    .then((r) => r.data ?? [])

  const high = anomaliasRows.filter((a) => a.severidade === 'HIGH').length
  const medium = anomaliasRows.filter((a) => a.severidade === 'MEDIUM').length
  const low = anomaliasRows.filter((a) => a.severidade === 'LOW').length
  const pendentes = anomaliasRows.filter((a) => a.status === 'pendente').length

  return NextResponse.json({
    kpi,
    linhas,
    anomalias: {
      high,
      medium,
      low,
      pendentes,
      lista: anomaliasRows,
    },
  })
}
