import { describe, it, expect } from 'vitest'
import { tabToDate } from './escala-pax'

describe('tabToDate', () => {
  it('converte tab "15" com ano 2025 e mês 3 → "2025-03-15"', () => {
    expect(tabToDate('15', 2025, 3)).toBe('2025-03-15')
  })

  it('converte tab "05" com ano 2024 e mês 12 → "2024-12-05"', () => {
    expect(tabToDate('05', 2024, 12)).toBe('2024-12-05')
  })

  it('converte tab "1" (sem zero à esquerda) com ano 2025 e mês 1 → "2025-01-01"', () => {
    expect(tabToDate('1', 2025, 1)).toBe('2025-01-01')
  })

  it('trim em tab com espaços: " 7 " com ano 2025 e mês 6 → "2025-06-07"', () => {
    expect(tabToDate(' 7 ', 2025, 6)).toBe('2025-06-07')
  })

  it('retorna string vazia quando tab não é numérico (ex: "jan")', () => {
    expect(tabToDate('jan', 2025, 1)).toBe('')
  })

  it('NÃO usa defaults hardcoded — usa os parâmetros passados', () => {
    // Garante que a função respeita ano/mes recebidos, não valores fixos
    expect(tabToDate('10', 2023, 7)).toBe('2023-07-10')
    expect(tabToDate('10', 2026, 11)).toBe('2026-11-10')
  })
})
