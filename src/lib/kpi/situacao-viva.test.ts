import { describe, it, expect } from 'vitest'
import { situacaoViva } from './situacao-viva'

describe('situacaoViva', () => {
  it('entregue vence tudo', () => {
    expect(situacaoViva({ entregue: true, naApi: false, saiuDaBase: false })).toBe('ENTREGUE')
  })
  it('não entregue + fora da API → SEM_SINAL', () => {
    expect(situacaoViva({ entregue: false, naApi: false, saiuDaBase: false })).toBe('SEM_SINAL')
  })
  it('não entregue + na API + saiu da base → EM_ROTA', () => {
    expect(situacaoViva({ entregue: false, naApi: true, saiuDaBase: true })).toBe('EM_ROTA')
  })
  it('não entregue + na API + não saiu → NA_BASE', () => {
    expect(situacaoViva({ entregue: false, naApi: true, saiuDaBase: false })).toBe('NA_BASE')
  })
})
