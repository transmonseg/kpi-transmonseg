import type { Metricas } from '@/lib/kpi/dashboard-metricas'

/** Linhas que dá pra conferir (denominador da taxa definitiva). */
export const conferiveis = (m: Metricas) => m.entregue + m.nao_foi

/** Linhas fora da conferência: sem rastreador + sem dado. */
export const foraConferencia = (m: Metricas) => m.total - conferiveis(m)

/** Cobertura de rastreamento sobre o total. */
export const visibilidadeGps = (m: Metricas) => (m.total ? Math.round((100 * m.com_rastreador) / m.total) : 0)

// Não existe mais status "em rota" (consolidado em "sem dado" — não dá pra saber
// o desfecho), então não tem mais como o KPI de um período detectar "ainda em
// andamento". O selo passa a ser sempre "Final".
export function seloTexto(): { provisorio: boolean; texto: string } {
  return { provisorio: false, texto: 'Final' }
}
