// F3-02 (ACH-03, AC-06), D-01 (plano mestre 23/10): meta do KPI numa
// constante única por cliente, usada pelo Ao vivo, pelo Dashboard e pelo
// Resumo do dia. Nutry 97 (o que a operação persegue); RQ 93 provisória,
// revista depois de F1-06, F2-03 e F2-04. Sem lado de servidor: a tela importa.

export const META_KPI_POR_CLIENTE = { nutrimax: 97, rioquality: 93 } as const

/** Cliente sem meta decidida (Porto Frio/Mavic, D-21): o 95 que o Dashboard
 *  usava para todos até 24/10. */
export const META_KPI_PADRAO = 95

export function metaDoCliente(cliente: string): number {
  return (META_KPI_POR_CLIENTE as Record<string, number>)[cliente] ?? META_KPI_PADRAO
}

/** Confirmações que faltam para a meta: ceil(meta × na conta) − entregues,
 *  nunca negativo. 22/10 Nutry: ceil(0,97 × 2.253) − 2.183 = 3. A folga de
 *  1e-9 evita que 97 × 100 / 100 vire 97,000…01 e suba para 98. */
export function faltamParaMeta(meta: number, naConta: number, entregues: number): number {
  if (naConta <= 0) return 0
  const alvo = Math.ceil((meta * naConta) / 100 - 1e-9)
  return Math.max(0, alvo - entregues)
}
