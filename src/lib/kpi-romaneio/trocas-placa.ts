// Troca de placa informada pela operação (tela "Placas do dia", 05/10):
// "a carga da placa X da escala foi feita pela placa Y". Aplicada logo depois
// do parse da Escala/Romaneio, antes de tudo -- o resto da geração já vê a
// placa que realmente rodou.
import { normPlaca } from '@/lib/unitrac-api'

export type TrocaPlaca = { carga: string | null; placaEscala: string; placaReal: string }

export function normalizarPlacaDigitada(s: string): string {
  return normPlaca(s.trim())
}

/** Substitui placaEscala -> placaReal no romaneio e na escala. Troca com
 *  `carga` só vale pra aquela carga; sem carga, pra todas da placa no dia.
 *  Várias trocas pra mesma placa/carga: a última da lista vence. */
export function aplicarTrocasDePlaca<
  R extends { carga: string; placa: string },
  E extends { carga: string; placaRaw: string; placaNorm: string },
>(romaneio: R[], escala: E[], trocas: TrocaPlaca[]): { romaneio: R[]; escala: E[]; aplicadas: number } {
  const destino = (carga: string, placa: string): string | null => {
    const p = normPlaca(placa)
    let real: string | null = null
    for (const t of trocas) {
      if (normPlaca(t.placaEscala) !== p) continue
      if (t.carga != null && t.carga.trim() !== '' && t.carga.trim() !== carga.trim()) continue
      real = normPlaca(t.placaReal)
    }
    return real
  }
  let aplicadas = 0
  const novoRomaneio = romaneio.map(l => {
    const real = destino(l.carga, l.placa)
    if (!real) return l
    aplicadas++
    return { ...l, placa: real }
  })
  const novaEscala = escala.map(e => {
    const real = destino(e.carga, e.placaNorm)
    return real ? { ...e, placaRaw: real, placaNorm: real } : e
  })
  return { romaneio: novoRomaneio, escala: novaEscala, aplicadas }
}
