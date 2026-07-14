import { describe, it, expect } from 'vitest'
import { checarCobertura } from './cobertura'
import type { LinhaEscalaNutrimax } from './types'
import type { LinhaRomaneioNutrimax } from './types'

function escala(overrides: Partial<LinhaEscalaNutrimax> = {}): LinhaEscalaNutrimax {
  return {
    carga: '92593',
    placaRaw: 'TTL7D40',
    placaNorm: 'TTL7D40',
    destino: 'CAMPOS',
    motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudante1: null,
    ajudante2: null,
    pesoKg: 2405,
    entPlanejado: 31,
    nfPlanejado: 2,
    ...overrides,
  }
}

function romaneio(overrides: Partial<LinhaRomaneioNutrimax> = {}): LinhaRomaneioNutrimax {
  return {
    carga: '92593',
    destino: 'CAMPOS',
    placa: 'TTL7D40',
    motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudantes: [],
    nf: '2270025',
    clienteCodigo: '165049',
    clienteNome: 'ANDRE LUIS SILVA VELASCO',
    endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *',
    ...overrides,
  }
}

describe('checarCobertura', () => {
  it('sem avisos quando escala e romaneio batem completamente', () => {
    const avisos = checarCobertura(
      [escala({ nfPlanejado: 2 })],
      [romaneio({ nf: '1' }), romaneio({ nf: '2' })],
    )
    expect(avisos).toEqual([])
  })

  it('carga_ausente: carga da escala não aparece em nenhuma linha do romaneio', () => {
    const avisos = checarCobertura(
      [escala({ carga: '92595', destino: 'DIRETA FRATELLI', placaNorm: 'XXX0000' })],
      [romaneio({ carga: '92593' })],
    )
    expect(avisos).toEqual([
      { tipo: 'carga_ausente', carga: '92595', destino: 'DIRETA FRATELLI', placa: 'XXX0000' },
    ])
  })

  it('placa_divergente: mesma carga, placas diferentes entre escala e romaneio', () => {
    const avisos = checarCobertura(
      [escala({ placaNorm: 'TTL7D40' })],
      [romaneio({ placa: 'ABC1D23' })],
    )
    expect(avisos).toContainEqual({
      tipo: 'placa_divergente', carga: '92593', placaEscala: 'TTL7D40', placaRomaneio: 'ABC1D23',
    })
  })

  it('entregas_incompletas: romaneio tem menos NFs que o planejado na escala', () => {
    const avisos = checarCobertura(
      [escala({ nfPlanejado: 5 })],
      [romaneio({ nf: '1' }), romaneio({ nf: '2' })],
    )
    expect(avisos).toContainEqual({
      tipo: 'entregas_incompletas', carga: '92593', planejado: 5, recebido: 2,
    })
  })

  it('carga do romaneio sem correspondência na escala não gera aviso (fora de escopo)', () => {
    const avisos = checarCobertura(
      [escala({ carga: '92593', nfPlanejado: 1 })],
      [romaneio({ carga: '92593' }), romaneio({ carga: '99999' })],
    )
    expect(avisos).toEqual([])
  })
})
