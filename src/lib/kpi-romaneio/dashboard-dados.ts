import { createServiceClient } from '@/lib/supabase/service'
import { hojeBR } from '@/lib/data-br'
import type { ResumoGeracao } from './resumo-dashboard'

export const CLIENTES_DASHBOARD = ['nutrimax', 'rioquality', 'portefrio'] as const
export type ClienteDashboard = (typeof CLIENTES_DASHBOARD)[number]

export const NOME_CLIENTE: Record<ClienteDashboard, string> = {
  nutrimax: 'Nutry Max',
  rioquality: 'Rio Quality',
  portefrio: 'Portefrio',
}

export type DiaDashboard = {
  data: string
  geradoEm: string
  geradoPor: string | null
  resumo: ResumoGeracao
}

/** Últimos `dias` dias com resumo do cliente -- só a geração MAIS RECENTE de
 *  cada dia (a que vale; regenerações substituem). Ordem crescente de data. */
export async function buscarSerieDashboard(cliente: ClienteDashboard, dias = 60): Promise<DiaDashboard[]> {
  const desde = new Date(`${hojeBR()}T12:00:00Z`)
  desde.setUTCDate(desde.getUTCDate() - dias)
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('kpi_romaneio_geracoes')
    .select('data_referencia, gerado_em, gerado_por, resumo')
    .eq('cliente', cliente)
    .not('resumo', 'is', null)
    .gte('data_referencia', desde.toISOString().slice(0, 10))
    .order('gerado_em', { ascending: false })
    .limit(500)
  if (error) throw new Error(`dashboard: ${error.message}`)
  const porDia = new Map<string, DiaDashboard>()
  for (const g of data ?? []) {
    if (porDia.has(g.data_referencia)) continue
    porDia.set(g.data_referencia, {
      data: g.data_referencia,
      geradoEm: g.gerado_em,
      geradoPor: g.gerado_por,
      resumo: g.resumo as ResumoGeracao,
    })
  }
  return [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data))
}
