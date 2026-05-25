/**
 * Helpers do matcher v2 — separados pra facilitar testes.
 */
import type { UnitracParadaRow } from './matcher'

/**
 * Computa saída do CD pra uma parada-alvo: última saída de BASE BENASSI estritamente
 * antes da chegada da parada.
 *
 * Para algumas redes (ZONA_SUL até 2026-05-18), usa PRIMEIRA saída de BASE no dia.
 *
 * Retorna null se nenhuma BASE for encontrada antes — "em branco honesto > timestamp errado".
 */
export function computeSaidaCdParaParadaV2(
  paradaAlvo: UnitracParadaRow,
  todasParadas: UnitracParadaRow[],
  ctx?: { redeId?: string; data?: string },
): Date | null {
  const alvoTs = new Date(paradaAlvo.chegada).getTime()
  // ZONA_SUL convenção antiga: até 2026-05-18 usava "primeira saída de BASE do dia"
  const usaPrimeira =
    ctx?.redeId === 'ZONA_SUL' &&
    typeof ctx?.data === 'string' &&
    ctx.data <= '2026-05-18'

  let lastBaseSaida: Date | null = null
  let firstBaseSaida: Date | null = null

  for (const p of todasParadas) {
    if (new Date(p.chegada).getTime() >= alvoTs) break
    // BASE: classificação BASE OU FAKE_EXIT com BASE BENASSI no local
    const localStr = p.local_parada ?? ''
    const isBase =
      p.classificacao === 'BASE' ||
      (p.classificacao === 'FAKE_EXIT' && localStr.startsWith('BASE BENASSI')) ||
      localStr.includes('BASE BENASSI')
    if (!isBase || !p.saida) continue

    const s = new Date(p.saida)
    if (s.getTime() < alvoTs) {
      if (!lastBaseSaida || s.getTime() > lastBaseSaida.getTime()) lastBaseSaida = s
      if (!firstBaseSaida || s.getTime() < firstBaseSaida.getTime()) firstBaseSaida = s
    }
  }

  return (usaPrimeira ? firstBaseSaida : lastBaseSaida) ?? null
}
