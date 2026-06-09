import { describe, it, expect } from 'vitest'
import { validarCoordLoja } from './validar-coord'

describe('validarCoordLoja (#37)', () => {
  it('coord válida na Grande Rio → null', () => {
    expect(validarCoordLoja(-22.903776, -43.556517)).toBeNull() // GB Campo Grande
    expect(validarCoordLoja(-22.85408, -43.02016)).toBeNull()   // Tribobó (São Gonçalo)
    expect(validarCoordLoja(-22.5, -43.18)).toBeNull()          // Petrópolis
  })
  it('coord ausente (as duas null) → null (opcional)', () => {
    expect(validarCoordLoja(null, null)).toBeNull()
  })
  it('só uma coord → erro', () => {
    expect(validarCoordLoja(-22.9, null)).toMatch(/latitude E longitude/i)
  })
  it('(0,0) → erro', () => {
    expect(validarCoordLoja(0, 0)).toMatch(/inválida/i)
  })
  it('lat↔lng trocada → erro específico', () => {
    expect(validarCoordLoja(-43.556517, -22.903776)).toMatch(/trocada/i)
  })
  it('fora da região (outro estado) → erro', () => {
    expect(validarCoordLoja(-23.55, -46.63)).toMatch(/fora da região/i) // São Paulo
  })
  it('não-número → erro', () => {
    expect(validarCoordLoja('abc', -43.5)).toMatch(/números/i)
  })
})
