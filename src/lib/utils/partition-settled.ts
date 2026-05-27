/**
 * Particiona um array de PromiseSettledResult em sucessos e falhas,
 * usando uma chave paralela pra identificar cada item.
 *
 * Bug U4 da auditoria externa 2026-05-27: quando 1 rede falha em
 * /api/kpi/simples, Promise.all rejeita toda a chain e o operador perde
 * os KPIs ja prontos das outras 5 redes. Com Promise.allSettled +
 * partitionSettled, as redes OK voltam normalmente e as falhas viram
 * { rede_id, erro_mensagem } no response.
 */
export interface FalhaSettled {
  key: string
  erro_mensagem: string
}

export function partitionSettled<T>(
  settled: readonly PromiseSettledResult<T>[],
  keys: readonly string[],
): { ok: T[]; falhas: FalhaSettled[] } {
  if (settled.length !== keys.length) {
    throw new Error(
      `partitionSettled: settled.length (${settled.length}) != keys.length (${keys.length})`,
    )
  }
  const ok: T[] = []
  const falhas: FalhaSettled[] = []
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]
    if (s.status === 'fulfilled') {
      ok.push(s.value)
    } else {
      const erro = s.reason instanceof Error ? s.reason.message : String(s.reason)
      falhas.push({ key: keys[i], erro_mensagem: erro })
    }
  }
  return { ok, falhas }
}
