import { describe, it, expect } from 'vitest'
import { calcTempoOperacao, COL_TEMPO_OPERACAO } from './gerador-kpi'

describe('calcTempoOperacao', () => {
  it('volta menos saída da base em min e HH:MM', () => {
    const r = calcTempoOperacao(new Date('2026-05-19T05:00:00Z'), new Date('2026-05-19T13:00:00Z'))
    expect(r).toEqual({ min: 480, fmt: '08:00' })
  })
  it('cruza meia-noite', () => {
    const r = calcTempoOperacao(new Date('2026-05-19T23:00:00Z'), new Date('2026-05-19T01:30:00Z'))
    expect(r).toEqual({ min: 150, fmt: '02:30' })
  })
  it('null quando falta dado', () => {
    expect(calcTempoOperacao(null, new Date())).toBeNull()
    expect(calcTempoOperacao(new Date(), null)).toBeNull()
  })
  it('flag desligada (não lança ainda)', () => {
    expect(COL_TEMPO_OPERACAO).toBe(false)
  })
})
