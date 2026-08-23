import { describe, it, expect } from 'vitest'
import { foraDoAlcanceApi } from './constants'

describe('foraDoAlcanceApi', () => {
  it('hoje esta dentro do alcance', () => {
    expect(foraDoAlcanceApi('2026-08-23', '2026-08-23')).toBe(false)
  })
  it('ontem esta dentro do alcance', () => {
    expect(foraDoAlcanceApi('2026-08-22', '2026-08-23')).toBe(false)
  })
  it('anteontem ja esta fora do alcance', () => {
    expect(foraDoAlcanceApi('2026-08-21', '2026-08-23')).toBe(true)
  })
})
