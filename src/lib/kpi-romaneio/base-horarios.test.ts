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

  it('resposta ok: mapa indexado por placa, com saida/chegada CONVERTIDOS de UTC real pra BRT mascarado como UTC', async () => {
    // Achado real 25/08: a ponte devolve UTC de verdade (timestamptz do
    // monitoramento) -- o resto do pipeline (formatarHora) espera BRT
    // mascarado como UTC (mesma convencao da Unitrac). 09:00 UTC real =
    // 06:00 BRT; a mascara representa isso como "06:00...Z".
    mockFetchOk([
      { placa: 'ABC1234', saidaBase: '2026-08-25T09:00:00.000Z', chegadaBase: '2026-08-25T21:00:00.000Z' },
      { placa: 'XYZ5678', saidaBase: null, chegadaBase: null },
    ])
    const mapa = await buscarHorariosBase(['ABC1234', 'XYZ5678'], '2026-08-25')
    expect(mapa.get('ABC1234')).toEqual({ saidaBase: '2026-08-25T06:00:00.000Z', chegadaBase: '2026-08-25T18:00:00.000Z' })
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
    expect(mapa.get('ABC1234')).toEqual({ saidaBase: '2026-08-25T06:00:00.000Z', chegadaBase: null })
  })

  it('paraBrtMascaradoComoUtc: aceita offset explicito (+02:00 do Postgres, ver TimeZone da role) e converte pro mesmo resultado que Z', async () => {
    // Achado real: PostgREST serializa timestamptz respeitando o TimeZone
    // da role/sessao (Europe/Berlin neste projeto), entao a ponte pode
    // devolver "+02:00" em vez de "Z" -- new Date() resolve os dois pro
    // MESMO instante absoluto, entao o resultado tem que ser identico.
    mockFetchOk([{ placa: 'ABC1234', saidaBase: '2026-08-25T11:00:00.000+02:00', chegadaBase: null }])
    const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
    // 11:00+02:00 == 09:00 UTC == 06:00 BRT
    expect(mapa.get('ABC1234')).toEqual({ saidaBase: '2026-08-25T06:00:00.000Z', chegadaBase: null })
  })
})
