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
})
