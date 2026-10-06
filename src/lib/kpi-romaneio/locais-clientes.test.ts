import { describe, it, expect } from 'vitest'
import { chaveClienteLocal, localUtilizavel, aplicarLocaisClientes, consolidarEvidencias, type LocalCliente } from './locais-clientes'
import type { LinhaGeocodificada } from './types'

const linha = (o: Partial<LinhaGeocodificada>): LinhaGeocodificada => ({
  carga: '99001', destino: 'X', placa: 'AAA1A11', motorista: 'M', ajudantes: [], nf: '1', clienteCodigo: '5778', clienteNome: 'CLIENTE', endereco: 'RUA A, 10 - CENTRO, RIO DE JANEIRO - * - 20000000',
  lat: -22.9, lng: -43.2, geoConfiavel: false, ...o,
} as LinhaGeocodificada)
const local = (o: Partial<LocalCliente>): LocalCliente => ({ chave: '5778', lat: -22.95, lng: -43.25, raioM: null, fonte: 'manual', confirmacoes: 1, enderecoRef: 'RUA A, 10 - CENTRO, RIO DE JANEIRO', ...o })

describe('chave do cliente', () => {
  it('código do cliente do romaneio principal; pão (NF no lugar do código) não entra', () => {
    expect(chaveClienteLocal(linha({}))).toBe('5778')
    expect(chaveClienteLocal(linha({ carga: 'PAO-9', clienteCodigo: '216553' }))).toBeNull()
    expect(chaveClienteLocal(linha({ clienteCodigo: '  ' }))).toBeNull()
  })
})

describe('local utilizável', () => {
  it('correção manual vale na hora; aprendido precisa de 2 confirmações', () => {
    expect(localUtilizavel(local({ fonte: 'manual', confirmacoes: 1 }))).toBe(true)
    expect(localUtilizavel(local({ fonte: 'entrega_confirmada', confirmacoes: 1 }))).toBe(false)
    expect(localUtilizavel(local({ fonte: 'entrega_confirmada', confirmacoes: 2 }))).toBe(true)
    expect(localUtilizavel(local({ fonte: 'parada_orfa', confirmacoes: 2 }))).toBe(true)
  })
})

describe('aplicarLocaisClientes', () => {
  it('troca a coordenada pela do cliente e marca como verificada', () => {
    const { linhas, aplicados } = aplicarLocaisClientes([linha({})], new Map([['5778', local({})]]))
    expect(linhas[0]).toMatchObject({ lat: -22.95, lng: -43.25, geoConfiavel: true, geoMotivo: undefined, geoVerificadoManual: true })
    expect(aplicados).toEqual(['1'])
  })
  it('cliente mudou de endereço (texto diferente e geocode confiável a mais de 2 km): não troca', () => {
    const l = linha({ endereco: 'AV NOVA, 500 - BARRA, RIO DE JANEIRO - * - 22000000', lat: -23.0, lng: -43.4, geoConfiavel: true })
    const { linhas, aplicados } = aplicarLocaisClientes([l], new Map([['5778', local({})]]))
    expect(linhas[0].lat).toBe(-23.0)
    expect(aplicados).toEqual([])
  })
  it('texto diferente mas geocode ruim (ou perto): troca', () => {
    const l = linha({ endereco: 'R A 10 - CENTRO, RIO DE JANEIRO - * - 20000000', geoConfiavel: false })
    expect(aplicarLocaisClientes([l], new Map([['5778', local({})]])).aplicados).toEqual(['1'])
  })
  it('sem local, ou local ainda não confirmado: deixa como está', () => {
    expect(aplicarLocaisClientes([linha({})], new Map()).aplicados).toEqual([])
    expect(aplicarLocaisClientes([linha({})], new Map([['5778', local({ fonte: 'entrega_confirmada', confirmacoes: 1 })]])).aplicados).toEqual([])
  })
})

describe('consolidarEvidencias (aprendizado)', () => {
  it('local = mediana das evidências que concordam (até 200 m da mediana)', () => {
    const r = consolidarEvidencias([
      { lat: -22.9000, lng: -43.2000 }, { lat: -22.9004, lng: -43.2003 }, { lat: -22.9002, lng: -43.2001 }, { lat: -23.5, lng: -44 },
    ])!
    expect(r.confirmacoes).toBe(3)
    expect(r.lat).toBeCloseTo(-22.9002, 4)
    expect(r.lng).toBeCloseTo(-43.2001, 4)
  })
  it('sem evidência: null', () => {
    expect(consolidarEvidencias([])).toBeNull()
  })
})
