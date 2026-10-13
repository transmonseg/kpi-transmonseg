import { describe, it, expect } from 'vitest'
import { montarPayloadTroca } from './troca-payload'

describe('montarPayloadTroca', () => {
  it('redirecionar', () => {
    expect(montarPayloadTroca('redirecionar', { carga: 'C1', placaA: 'AAA1A11', placaB: 'BBB2B22' }))
      .toEqual({ modo: 'redirecionar', carga: 'C1', placaEscala: 'AAA1A11', placaReal: 'BBB2B22' })
  })
  it('redirecionar sem carga -> erro', () => {
    expect(montarPayloadTroca('redirecionar', { placaA: 'AAA1A11', placaB: 'BBB2B22' })).toEqual({ erro: 'Escolha a carga e a placa.' })
  })
  it('mutua', () => {
    expect(montarPayloadTroca('mutua', { placaA: 'AAA1A11', placaB: 'BBB2B22' }))
      .toEqual({ modo: 'mutua', placaEscala: 'AAA1A11', placaB: 'BBB2B22' })
  })
  it('substituir', () => {
    expect(montarPayloadTroca('substituir', { placaA: 'AAA1A11', placaB: 'BBB2B22' }))
      .toEqual({ modo: 'substituir', placaEscala: 'AAA1A11', placaB: 'BBB2B22' })
  })
  it('placa-a-placa sem as duas -> erro', () => {
    expect(montarPayloadTroca('mutua', { placaA: 'AAA1A11' })).toEqual({ erro: 'Escolha as duas placas.' })
  })
})
