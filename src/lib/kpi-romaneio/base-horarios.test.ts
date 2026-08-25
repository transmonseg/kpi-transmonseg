import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { buscarHorariosBase } from './base-horarios'

beforeEach(() => {
  process.env.MOTOR_SECRET = 'segredo-teste'
  process.env.MONITORAMENTO_URL = 'http://127.0.0.1:3010'
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.MOTOR_SECRET
  delete process.env.MONITORAMENTO_URL
})

function mockFetchOk(resultados: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ resultados }),
  } as Response)
}

describe('buscarHorariosBase', () => {
  it('lista vazia nao chama fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const mapa = await buscarHorariosBase([], '2026-08-25')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mapa.size).toBe(0)
  })

  it('resposta ok: mapa indexado por placa com saida/chegada', async () => {
    mockFetchOk([
      { placa: 'ABC1234', saidaBase: '2026-08-25T09:00:00.000Z', chegadaBase: '2026-08-25T21:00:00.000Z' },
      { placa: 'XYZ5678', saidaBase: null, chegadaBase: null },
    ])
    const mapa = await buscarHorariosBase(['ABC1234', 'XYZ5678'], '2026-08-25')
    expect(mapa.get('ABC1234')).toEqual({ saidaBase: '2026-08-25T09:00:00.000Z', chegadaBase: '2026-08-25T21:00:00.000Z' })
    expect(mapa.get('XYZ5678')).toEqual({ saidaBase: null, chegadaBase: null })
  })

  it('MOTOR_SECRET ausente: nao chama fetch, devolve mapa vazio', async () => {
    delete process.env.MOTOR_SECRET
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mapa.size).toBe(0)
  })

  it('monitoramento responde erro HTTP: mapa vazio, nunca lanca', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
    expect(mapa.size).toBe(0)
  })

  it('fetch rejeita (timeout/rede): mapa vazio, nunca lanca', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'))
    const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
    expect(mapa.size).toBe(0)
  })

  it('JSON invalido na resposta: mapa vazio, nunca lanca', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error('nao e JSON') },
    } as unknown as Response)
    const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
    expect(mapa.size).toBe(0)
  })

  it('item malformado na resposta e ignorado, sem derrubar os outros', async () => {
    mockFetchOk([
      { placa: 'ABC1234', saidaBase: '2026-08-25T09:00:00.000Z', chegadaBase: null },
      { placa: 123, saidaBase: null, chegadaBase: null }, // placa nao e string
      'nao e objeto',
    ])
    const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
    expect(mapa.size).toBe(1)
    expect(mapa.get('ABC1234')).toEqual({ saidaBase: '2026-08-25T09:00:00.000Z', chegadaBase: null })
  })
})
