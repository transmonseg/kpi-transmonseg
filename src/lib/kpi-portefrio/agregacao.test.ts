import { describe, it, expect } from 'vitest'
import { agregarPorCliente } from './agregacao'
import type { LinhaGeocodificada, Visita } from './types'

const LINHA: LinhaGeocodificada = {
  placa: 'LUE5C42', codigoCliente: 'C1', cnpj: '123', razaoSocial: 'EMPRESA LTDA',
  nomeInformal: 'LOJA TESTE', endereco: 'RUA X', numero: '10', cep: '20000000',
  bairro: 'CENTRO', cidade: 'CIDADE X', uf: 'RJ', ordem: 3, lat: -22.8, lng: -43.2,
}

describe('agregarPorCliente', () => {
  it('cliente nao visitado (sem Visita) fica com todos os campos de confirmacao null', () => {
    const linha = agregarPorCliente(LINHA, undefined, null)
    expect(linha).toEqual({
      placa: 'LUE5C42',
      ordemPlanejada: 3,
      ordemReal: null,
      cliente: 'LOJA TESTE',
      endereco: 'RUA X, 10 - CENTRO, CIDADE X - RJ',
      visitado: false,
      horarioChegada: null,
      tempMin: null,
      tempMax: null,
      tempMedia: null,
    })
  })

  it('cliente visitado com temperatura calcula min/max/media', () => {
    const visita: Visita = {
      codigoCliente: 'C1', chegada: '2026-08-24T10:00:00Z', saida: '2026-08-24T10:10:00Z',
      distanciaMetrosDoPonto: 50, temperaturas: [-18, -16, -20],
    }
    const linha = agregarPorCliente(LINHA, visita, 2)
    expect(linha.visitado).toBe(true)
    expect(linha.ordemReal).toBe(2)
    expect(linha.horarioChegada).toBe('2026-08-24T10:00:00Z')
    expect(linha.tempMin).toBe(-20)
    expect(linha.tempMax).toBe(-16)
    expect(linha.tempMedia).toBeCloseTo(-18, 5)
  })

  it('cliente visitado SEM leitura de temperatura fica com temp null (nao trava a linha)', () => {
    const visita: Visita = {
      codigoCliente: 'C1', chegada: '2026-08-24T10:00:00Z', saida: '2026-08-24T10:00:00Z',
      distanciaMetrosDoPonto: 50, temperaturas: [],
    }
    const linha = agregarPorCliente(LINHA, visita, 1)
    expect(linha.visitado).toBe(true)
    expect(linha.tempMin).toBeNull()
    expect(linha.tempMax).toBeNull()
    expect(linha.tempMedia).toBeNull()
  })

  it('usa razaoSocial como nome do cliente quando nomeInformal esta vazio', () => {
    const linha = agregarPorCliente({ ...LINHA, nomeInformal: '' }, undefined, null)
    expect(linha.cliente).toBe('EMPRESA LTDA')
  })
})
