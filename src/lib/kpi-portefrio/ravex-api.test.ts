import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./ravex-auth', () => ({ obterTokenRavex: vi.fn(), invalidarTokenRavex: vi.fn() }))
import { obterTokenRavex, invalidarTokenRavex } from './ravex-auth'
import { resolverIdVeiculo, buscarHistoricoVeiculo } from './ravex-api'

beforeEach(() => {
  vi.mocked(obterTokenRavex).mockReset().mockResolvedValue('token-teste')
  vi.mocked(invalidarTokenRavex).mockReset()
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

  it('token cacheado devolve 401 -- reautentica e repete a chamada com sucesso', async () => {
    vi.mocked(obterTokenRavex)
      .mockResolvedValueOnce('token-velho')
      .mockResolvedValueOnce('token-novo')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ Id: 14296, PlacaNome: 'LUE5C42' }] }), { status: 200 }))

    expect(await resolverIdVeiculo('LUE5C42')).toBe(14296)
    expect(obterTokenRavex).toHaveBeenCalledTimes(2)
    expect(invalidarTokenRavex).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[1][1]?.headers).toEqual({ Authorization: 'Bearer token-novo' })
  })

  it('401 persiste mesmo apos renovar o token -- lanca (fail-loud), nao devolve null', async () => {
    vi.mocked(obterTokenRavex)
      .mockResolvedValueOnce('token-velho')
      .mockResolvedValueOnce('token-novo')
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }))

    await expect(resolverIdVeiculo('LUE5C42')).rejects.toThrow(/Ravex.*token/i)
  })

  it('relogin apos 401 tambem falha (conta bloqueada) -- propaga, nao devolve null', async () => {
    vi.mocked(obterTokenRavex)
      .mockResolvedValueOnce('token-velho')
      .mockRejectedValueOnce(new Error('Falha ao autenticar na Ravex: acesso_bloqueado'))
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 401 }))

    await expect(resolverIdVeiculo('LUE5C42')).rejects.toThrow('Falha ao autenticar na Ravex')
    expect(invalidarTokenRavex).toHaveBeenCalledTimes(1)
  })

  it('500 (nao e 401/403) devolve null, sem retry e sem lancar', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    expect(await resolverIdVeiculo('LUE5C42')).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(invalidarTokenRavex).not.toHaveBeenCalled()
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

  it('evento com GPSLatitude ausente (campo faltando -> NaN) e excluido, mantendo os validos', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        value: [
          { EventoDatahora: '2026-08-24T10:00:00-03:00', GPSLatitude: -22.8, GPSLongitude: -43.2, CanRefrigeracao_CabineTemperatura: -18.5 },
          { EventoDatahora: '2026-08-24T10:10:00-03:00', GPSLongitude: -43.22, CanRefrigeracao_CabineTemperatura: null },
          { EventoDatahora: '2026-08-24T10:15:00-03:00', GPSLatitude: -22.82, GPSLongitude: -43.23, CanRefrigeracao_CabineTemperatura: -17 },
        ],
      }), { status: 200 }),
    )
    const eventos = await buscarHistoricoVeiculo(14296, 1000, 2000)
    expect(eventos).toEqual([
      { dataHora: '2026-08-24T10:00:00-03:00', lat: -22.8, lng: -43.2, temperatura: -18.5 },
      { dataHora: '2026-08-24T10:15:00-03:00', lat: -22.82, lng: -43.23, temperatura: -17 },
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
