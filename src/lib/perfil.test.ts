import { describe, it, expect } from 'vitest'
import { conviteExpirado } from './perfil'

describe('conviteExpirado', () => {
  it('null (nunca expira) → false', () => {
    expect(conviteExpirado(null)).toBe(false)
  })

  it('data no passado → true', () => {
    expect(conviteExpirado('2020-01-01T00:00:00.000Z')).toBe(true)
  })

  it('data no futuro → false', () => {
    expect(conviteExpirado('2999-01-01T00:00:00.000Z')).toBe(false)
  })
})
