import { describe, it, expect } from 'vitest'
import { horarioEntregaGabarito } from './horario-gabarito'

const d = (h: number, m: number) => new Date(Date.UTC(2026, 5, 16, h, m))

describe('horarioEntregaGabarito', () => {
  it('divergência grande (drive-by) → usa a API', () => {
    // BBH1C94: PDF 05:34 vs API 06:54
    expect(horarioEntregaGabarito(d(5, 34), d(6, 54))).toEqual(d(6, 54))
  })
  it('divergência pequena (≤15min) → mantém o PDF', () => {
    expect(horarioEntregaGabarito(d(7, 25), d(7, 18))).toEqual(d(7, 25))
  })
  it('sem horário da API → mantém o PDF', () => {
    expect(horarioEntregaGabarito(d(5, 34), null)).toEqual(d(5, 34))
  })
  it('API mais tarde com diferença ≤15min → mantém o PDF (caso do bug 1 com Tia Erica)', () => {
    // Matcher via bloco Tia Erica deu 5:41; API tem 6:09 (28min > 15min).
    // Este teste documenta o comportamento atual: o gabarito SUBSTITUIRIA para 6:09.
    // O bug 1 é resolvido via RAIO_MIN_M (parada 5:41 vira LOJA) + modo API usa
    // parada mais cedo no gabarito (route.ts), não aqui.
    expect(horarioEntregaGabarito(d(5, 41), d(6, 9))).toEqual(d(6, 9))
  })
})
