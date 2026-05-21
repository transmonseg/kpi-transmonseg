import { describe, it, expect } from 'vitest'
import { normalizaFilialCod } from './escala-zona-sul'

describe('normalizaFilialCod', () => {
  it('zero-pad "4" → "04"', () => {
    expect(normalizaFilialCod('4')).toBe('04')
  })

  it('"04" não muda → "04"', () => {
    expect(normalizaFilialCod('04')).toBe('04')
  })

  it('"12" não muda → "12"', () => {
    expect(normalizaFilialCod('12')).toBe('12')
  })

  it('trim de espaços antes do pad: " 5 " → "05"', () => {
    expect(normalizaFilialCod(' 5 ')).toBe('05')
  })
})
