// Fim da rota = ultima entrega do dia (achado 22/09, RBG5G18 21/09): a
// CHEGADA CD tem que ser a primeira volta a base DEPOIS disso; uma saida
// extra sem entrega nao e' rota. Tudo na convencao mascarada (digitos BRT + Z).
import type { Visita } from './types'
import type { AlvoApi } from '@/lib/unitrac-api'
import type { ParadaBridge } from './base-horarios'

export const FOLGA_VOLTA_EXTRA_MIN = 30

const instante = (isoMascarado: string) => Date.parse(isoMascarado.replace(/(Z|[+-]\d\d:?\d\d)$/, '') + 'Z')

/** Maior instante entre saida das visitas (mascarado) e feitoISO dos alvos
 *  situacao=1 (digitos BRT). Retorna ISO mascarado (toISOString) ou null. */
export function fimDaRota(visitas: Iterable<Visita>, alvosDaPlaca: AlvoApi[]): string | null {
  let max = -Infinity
  for (const v of visitas) if (v.saida) max = Math.max(max, instante(v.saida))
  for (const a of alvosDaPlaca) if (a.situacao === 1 && a.feitoISO) max = Math.max(max, instante(a.feitoISO))
  return Number.isFinite(max) ? new Date(max).toISOString() : null
}

/** true se ha parada BASE com chegada >= fimRota e (chegadaBase - essa
 *  chegada) > FOLGA_VOLTA_EXTRA_MIN. Tudo mascarado. */
export function precisaAjustarChegada(paradas: ParadaBridge[], fimRota: string | null, chegadaBase: string | null): boolean {
  if (!fimRota || !chegadaBase) return false
  const fim = instante(fimRota), chegada = instante(chegadaBase)
  return paradas.some(p => p.classificacao === 'BASE'
    && instante(p.chegada) >= fim
    && (chegada - instante(p.chegada)) / 60_000 > FOLGA_VOLTA_EXTRA_MIN)
}
