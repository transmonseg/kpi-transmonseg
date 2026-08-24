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

  it('erro de rede (apos login ok) devolve null, nao lanca', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'))
    expect(await resolverIdVeiculo('LUE5C42')).toBeNull()
  })

  it('falha de login propaga como erro, nao vira null', async () => {
    vi.mocked(obterTokenRavex).mockRejectedValue(new Error('Falha ao autenticar na Ravex: credenciais invalidas'))
    await expect(resolverIdVeiculo('LUE5C42')).rejects.toThrow('Falha ao autenticar na Ravex')
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

  it('erro de rede (apos login ok) devolve array vazio, nao lanca', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'))
    expect(await buscarHistoricoVeiculo(14296, 1000, 2000)).toEqual([])
  })

  it('falha de login propaga como erro, nao vira array vazio', async () => {
    vi.mocked(obterTokenRavex).mockRejectedValue(new Error('Falha ao autenticar na Ravex: credenciais invalidas'))
    await expect(buscarHistoricoVeiculo(14296, 1000, 2000)).rejects.toThrow('Falha ao autenticar na Ravex')
  })
})
