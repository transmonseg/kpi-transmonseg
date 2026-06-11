import { describe, it, expect } from 'vitest'
import { corrigirPlaca, corrigirLoja, validarRotaConcluida } from './index'

describe('corrigirPlaca', () => {
  const frota = [{ cv: '18594', placa: 'TUL-1C38', placaNorm: 'TUL1C38' }]
  it('completa placa parcial por sufixo único', () => {
    const r = corrigirPlaca('1C38', frota)
    expect(r).toEqual({ placa: 'TUL-1C38', cv: '18594', origem: 'api' })
  })
  it('retorna null se ambíguo ou inexistente', () => {
    expect(corrigirPlaca('ZZZZ', frota)).toBeNull()
  })
})

describe('corrigirLoja', () => {
  it('acha loja pela coordenada e marca origem', () => {
    const pontos = { '560036': { nome: 'LOJA A', lat: -22.9, lon: -43.2, raio: 50, cod: '560036' } }
    const r = corrigirLoja(-22.9001, -43.2001, pontos)
    expect(r).toMatchObject({ codigoUnitrac: '560036', nome: 'LOJA A', origem: 'api' })
  })
})

describe('validarRotaConcluida', () => {
  it('marca suspeita quando carro ainda em movimento', () => {
    const pos = { TUL1C38: { cv: '18594', velocidade: 40, ignicao: true, datagps: 'x' } }
    expect(validarRotaConcluida('TUL-1C38', pos)).toEqual({ aindaRodando: true, origem: 'api' })
  })
  it('null quando parado/sem dado', () => {
    expect(validarRotaConcluida('TUL-1C38', {})).toBeNull()
  })
})
