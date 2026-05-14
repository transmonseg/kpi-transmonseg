import type { KpiLinha } from '@/lib/types/kpi'
import { createServiceClient } from '@/lib/supabase/service'

type ParadaJson = {
  loja_id: string | null
  nome: string
  chegada: string
  saida: string
  duracao_min: number
  classificacao: string
}

type KpiRotaJoined = {
  id: string
  escala_linha_id: string
  placa_norm: string | null
  saida_cd: string | null
  paradas_json: ParadaJson[]
  escala_linhas: {
    motorista_nome: string | null
    loja_nome_raw: string
    carro_ordem: number
  } | null
}

export async function consolidaKpi(params: {
  kpi_id: string
  data: string
  rede_id: string
  svc: ReturnType<typeof createServiceClient>
}): Promise<KpiLinha[]> {
  const { kpi_id, data, rede_id, svc } = params

  const { data: rotasRaw, error: rotasErr } = await svc
    .from('kpi_rotas')
    .select(`
      id,
      escala_linha_id,
      placa_norm,
      saida_cd,
      paradas_json,
      escala_linhas (
        motorista_nome,
        loja_nome_raw,
        carro_ordem
      )
    `)
    .eq('data', data)
    .eq('rede_id', rede_id)

  if (rotasErr) throw new Error(`Erro ao buscar kpi_rotas: ${rotasErr.message}`)

  const rotas = (rotasRaw ?? []) as unknown as KpiRotaJoined[]

  const kpiLinhas: KpiLinha[] = rotas
    .sort((a, b) => {
      const nomeA = a.escala_linhas?.loja_nome_raw ?? ''
      const nomeB = b.escala_linhas?.loja_nome_raw ?? ''
      return nomeA.localeCompare(nomeB)
    })
    .map((rota, idx) => {
      const escala = rota.escala_linhas
      const paradas = (rota.paradas_json ?? []) as ParadaJson[]
      const carroOrdem = (escala?.carro_ordem ?? 1) as 1 | 2
      let motorista = escala?.motorista_nome ?? null
      if (carroOrdem === 2 && motorista) {
        motorista = `(2º CARRO) ${motorista}`
      }

      const p1 = paradas[0] ?? null
      const p2 = paradas[1] ?? null
      const p3 = paradas[2] ?? null

      return {
        kpi_id,
        escala_linha_id: rota.escala_linha_id,
        ordem: idx + 1,
        loja_nome: escala?.loja_nome_raw ?? '',
        motorista,
        placa: rota.placa_norm,
        carro_ordem: carroOrdem,
        saida_cd: rota.saida_cd ? new Date(rota.saida_cd) : null,
        chd_loja_1: p1 ? new Date(p1.chegada) : null,
        saida_loja_1: p1 ? new Date(p1.saida) : null,
        tempo_loja_1_min: p1?.duracao_min ?? null,
        chd_loja_2: p2 ? new Date(p2.chegada) : null,
        saida_loja_2: p2 ? new Date(p2.saida) : null,
        tempo_loja_2_min: p2?.duracao_min ?? null,
        chd_loja_3: p3 ? new Date(p3.chegada) : null,
        saida_loja_3: p3 ? new Date(p3.saida) : null,
        tempo_loja_3_min: p3?.duracao_min ?? null,
        observacao: null,
      } satisfies KpiLinha
    })

  // Delete existing kpi_linhas for this kpi_id and re-insert (idempotent)
  const { error: delErr } = await svc.from('kpi_linhas').delete().eq('kpi_id', kpi_id)
  if (delErr) throw new Error(`Erro ao limpar kpi_linhas: ${delErr.message}`)

  if (kpiLinhas.length > 0) {
    const rows = kpiLinhas.map((l) => ({
      kpi_id: l.kpi_id,
      escala_linha_id: l.escala_linha_id,
      ordem: l.ordem,
      loja_nome: l.loja_nome,
      motorista: l.motorista,
      placa: l.placa,
      carro_ordem: l.carro_ordem,
      saida_cd: l.saida_cd?.toISOString() ?? null,
      chd_loja_1: l.chd_loja_1?.toISOString() ?? null,
      saida_loja_1: l.saida_loja_1?.toISOString() ?? null,
      tempo_loja_1_min: l.tempo_loja_1_min,
      chd_loja_2: l.chd_loja_2?.toISOString() ?? null,
      saida_loja_2: l.saida_loja_2?.toISOString() ?? null,
      tempo_loja_2_min: l.tempo_loja_2_min,
      chd_loja_3: l.chd_loja_3?.toISOString() ?? null,
      saida_loja_3: l.saida_loja_3?.toISOString() ?? null,
      tempo_loja_3_min: l.tempo_loja_3_min,
      observacao: l.observacao,
    }))

    const { error: insertErr } = await svc.from('kpi_linhas').insert(rows)
    if (insertErr) throw new Error(`Erro ao inserir kpi_linhas: ${insertErr.message}`)
  }

  const { error: updateErr } = await svc
    .from('kpis')
    .update({ qtd_linhas: kpiLinhas.length, status: 'gerada' })
    .eq('id', kpi_id)
  if (updateErr) throw new Error(`Erro ao atualizar kpis: ${updateErr.message}`)

  return kpiLinhas
}
