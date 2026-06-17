import type { Metricas } from '@/lib/kpi/dashboard-metricas'

/** Linhas que dá pra conferir (denominador da taxa definitiva). */
export const conferiveis = (m: Metricas) => m.entregue + m.nao_foi

/** Linhas fora da conferência: em rota + mudou + desatualizado + sem rastreador + em análise. */
export const foraConferencia = (m: Metricas) => m.total - conferiveis(m)

/** Cobertura de rastreamento sobre o total. */
export const visibilidadeGps = (m: Metricas) => (m.total ? Math.round((100 * m.com_rastreador) / m.total) : 0)

/** Tem rota em andamento => o período ainda não fechou. */
export const ehProvisorio = (m: Metricas) => m.em_rota > 0

export function seloTexto(m: Metricas): { provisorio: boolean; texto: string } {
  return ehProvisorio(m)
    ? { provisorio: true, texto: `Provisório · ${m.em_rota} em rota` }
    : { provisorio: false, texto: 'Final' }
}
