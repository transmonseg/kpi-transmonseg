import { describe, it, expect } from 'vitest'
import { normalizeForScore, hybridScore, isSameStore } from './score'

describe('normalizeForScore', () => {
  it('lowercases and removes accents', () => {
    expect(normalizeForScore('ASSAÍ')).toBe('assai')
    expect(normalizeForScore('Prezunic')).toBe('prezunic')
  })
  it('removes special chars', () => {
    expect(normalizeForScore('Zona Sul #12')).toBe('zona sul 12')
  })
  it('collapses whitespace', () => {
    expect(normalizeForScore('  Pão   de  Açúcar  ')).toBe('pao de acucar')
  })
})

describe('hybridScore', () => {
  it('returns 1.0 for identical strings', () => {
    expect(hybridScore('assai', 'assai')).toBeCloseTo(1.0)
  })
  it('returns high score for close variant', () => {
    // "prezunic" vs "pruzenic" — one transposition + one substitution
    expect(hybridScore('prezunic', 'pruzenic')).toBeGreaterThan(0.7)
  })
  it('returns low score for completely different names', () => {
    expect(hybridScore('assai', 'princesa')).toBeLessThan(0.4)
  })
  it('handles truncated names', () => {
    // "zona" should still score reasonably against "zona sul"
    expect(hybridScore('zona', 'zona sul')).toBeGreaterThan(0.5)
  })
  it('distinguishes different store numbers', () => {
    // strings differ by 1 char in 11 — hybrid score ~0.94; strictly less than identical (1.0)
    const diffNum = hybridScore('zona sul 18', 'zona sul 12')
    const sameNum = hybridScore('zona sul 18', 'zona sul 18')
    expect(diffNum).toBeLessThan(sameNum)
    expect(diffNum).toBeLessThan(0.97)
    expect(sameNum).toBeCloseTo(1.0)
  })
})

describe('isSameStore', () => {
  it('returns true for high-confidence match', () => {
    expect(isSameStore('Prezunic', 'prezunic')).toBe(true)
    expect(isSameStore('ASSAÍ', 'Assaí')).toBe(true)
  })
  it('returns false for different stores', () => {
    expect(isSameStore('Assai', 'Sendas')).toBe(false)
    expect(isSameStore('Princesa', 'Prezunic')).toBe(false)
  })
})
