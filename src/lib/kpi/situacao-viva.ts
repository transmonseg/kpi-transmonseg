export type SituacaoViva = 'ENTREGUE' | 'EM_ROTA' | 'NA_BASE' | 'SEM_SINAL'

/** Andamento ao vivo de uma linha no beta. Honesto pra geração cedo: distingue
 *  "ainda não saiu" e "em rota" de uma falha. Não crava "não foi" (evita falso). */
export function situacaoViva(a: { entregue: boolean; naApi: boolean; saiuDaBase: boolean }): SituacaoViva {
  if (a.entregue) return 'ENTREGUE'
  if (!a.naApi) return 'SEM_SINAL'
  return a.saiuDaBase ? 'EM_ROTA' : 'NA_BASE'
}

export const SITUACAO_VIVA_LABEL: Record<SituacaoViva, string> = {
  ENTREGUE: 'Entregue', EM_ROTA: 'Em rota', NA_BASE: 'Na base', SEM_SINAL: 'Sem sinal',
}
