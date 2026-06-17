import { describe, it, expect } from 'vitest'
import { fmtMin, fmtNum, ORDEM_STATUS, STATUS_LABEL, STATUS_COR } from './tema'

describe('tema', () => {
  it('placeholder de sem-dado é "s/d", nunca travessão', () => {
    expect(fmtMin(null)).toBe('s/d')
    expect(fmtMin(NaN)).toBe('s/d')
    expect(fmtNum(null)).toBe('s/d')
    expect(fmtMin(90)).toBe('1h30')
    expect(fmtMin(45)).toBe('45min')
    for (const v of [fmtMin(null), fmtNum(null)]) expect(v).not.toContain('—')
  })
  it('as 7 categorias têm rótulo e cor; "indefinido" é "Em análise"', () => {
    expect(ORDEM_STATUS).toHaveLength(7)
    expect(STATUS_LABEL.indefinido).toBe('Em análise')
    expect(STATUS_LABEL.entregue).toBe('Entregue')
    for (const k of ORDEM_STATUS) expect(STATUS_COR[k]).toMatch(/^#|^var|^rgb/)
    // em análise e sem rastreador NÃO podem ter a mesma cor (viram blob único)
    expect(STATUS_COR.indefinido).not.toBe(STATUS_COR.sem_rastreador)
  })
})
