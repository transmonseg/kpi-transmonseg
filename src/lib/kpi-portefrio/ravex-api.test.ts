import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./ravex-auth', () => ({ obterTokenRavex: vi.fn() }))
import { obterTokenRavex } from './ravex-auth'
import { resolverIdVeiculo, buscarHistoricoVeiculo } from './ravex-api'

beforeEach(() => {
  vi.mocked(obterTokenRavex).mockResolvedValue('token-teste')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolverIdVeiculo', () => {
  it('placa encontrada devolve o Id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ value: [{ Id: 14296, PlacaNome: 'LUE5C42' }] }), { status: 200 }),
    )
    expect(await resolverIdVeiculo('LUE5C42')).toBe(14296)
  })

  it('placa nao encontrada (value vazio) devolve null, nao lanca', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ value: [] }), { status: 200 }),
    )
    expect(await resolverIdVeiculo('ZZZ0000')).toBeNull()
  })

  it('erro de rede devolve null, nao lanca', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'))
    expect(await resolverIdVeiculo('LUE5C42')).toBeNull()
  })
})

describe('buscarHistoricoVeiculo', () => {
  it('devolve os eventos mapeados', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        value: [
          { EventoDatahora: '2026-08-24T10:00:00-03:00', GPSLatitude: -22.8, GPSLongitude: -43.2, CanRefrigeracao_CabineTemperatura: -18.5 },
          { EventoDatahora: '2026-08-24T10:05:00-03:00', GPSLatitude: '-22.81', GPSLongitude: '-43.21', CanRefrigeracao_CabineTemperatura: null },
        ],
      }), { status: 200 }),
    )
    const eventos = await buscarHistoricoVeiculo(14296, 1000, 2000)
    expect(eventos).toEqual([
      { dataHora: '2026-08-24T10:00:00-03:00', lat: -22.8, lng: -43.2, temperatura: -18.5 },
      { dataHora: '2026-08-24T10:05:00-03:00', lat: -22.81, lng: -43.21, temperatura: null },
    ])
  })

  it('erro de rede devolve array vazio, nao lanca', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'))
    expect(await buscarHistoricoVeiculo(14296, 1000, 2000)).toEqual([])
  })
})
