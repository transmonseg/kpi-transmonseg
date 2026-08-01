import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { foraDoAlcanceApi } from './constants'

// buscarStopsCru só pede as últimas 48h da API — cobertura garantida é hoje/ontem
// (ver comentário em constants.ts). "Agora" fixado em 01/08/2026 14:00 BRT.
describe('foraDoAlcanceApi', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T17:00:00Z')) // 14:00 em America/Sao_Paulo (UTC-3)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hoje está dentro do alcance', () => {
    expect(foraDoAlcanceApi('2026-08-01')).toBe(false)
  })

  it('ontem está dentro do alcance', () => {
    expect(foraDoAlcanceApi('2026-07-31')).toBe(false)
  })

  it('anteontem já está fora do alcance garantido', () => {
    expect(foraDoAlcanceApi('2026-07-30')).toBe(true)
  })

  it('data de 17 dias atrás está fora do alcance', () => {
    expect(foraDoAlcanceApi('2026-07-15')).toBe(true)
  })
})
