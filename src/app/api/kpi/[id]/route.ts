import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { KpiLinha } from '@/lib/types/kpi'

export const runtime = 'nodejs'

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
  // anomalias.kpi_rota_id aponta para kpi_rotas.id (NÃO para kpis.id).
  const { data: rotasDoKpi } = await svc
    .from('kpi_rotas')
    .select('id')
    .eq('data', kpi.data)
    .eq('rede_id', kpi.rede_id)
  const rotaIds = (rotasDoKpi ?? []).map((r) => r.id as string)

  const { data: linhasRaw } = await svc
    .from('kpi_linhas')
    .select('*')
    .eq('kpi_id', id)
    .order('ordem')

  const linhas: KpiLinha[] = (linhasRaw ?? []).map(r => ({
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
  }))

  // Se o KPI não tem rotas, todas as contagens são 0 (evita .in() com array vazio).
  const [high, medium, low, pendentes] = rotaIds.length === 0
    ? [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }]
    : await Promise.all([
        svc.from('anomalias').select('id', { count: 'exact', head: true }).in('kpi_rota_id', rotaIds).eq('severidade', 'HIGH'),
        svc.from('anomalias').select('id', { count: 'exact', head: true }).in('kpi_rota_id', rotaIds).eq('severidade', 'MEDIUM'),
        svc.from('anomalias').select('id', { count: 'exact', head: true }).in('kpi_rota_id', rotaIds).eq('severidade', 'LOW'),
        svc.from('anomalias').select('id', { count: 'exact', head: true }).in('kpi_rota_id', rotaIds).eq('status', 'pendente'),
      ])

  return NextResponse.json({
    kpi,
    linhas,
    anomalias: {
      high: high.count ?? 0,
      medium: medium.count ?? 0,
      low: low.count ?? 0,
      pendentes: pendentes.count ?? 0,
    },
  })
}
