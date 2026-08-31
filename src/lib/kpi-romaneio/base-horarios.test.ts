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

  it('resposta ok: mapa indexado por placa, com saida/chegada CONVERTIDOS de UTC real pra BRT mascarado como UTC, km passa direto (sem fuso)', async () => {
    // Achado real 25/08: a ponte devolve UTC de verdade (timestamptz do
    // monitoramento) -- o resto do pipeline (formatarHora) espera BRT
    // mascarado como UTC (mesma convencao da Unitrac). 09:00 UTC real =
    // 06:00 BRT; a mascara representa isso como "06:00...Z". km nao tem
    // fuso, passa direto.
    mockFetchOk([
      { placa: 'ABC1234', saidaBase: '2026-08-25T09:00:00.000Z', chegadaBase: '2026-08-25T21:00:00.000Z', kmPercorrido: 203.4 },
      { placa: 'XYZ5678', saidaBase: null, chegadaBase: null, kmPercorrido: null },
    ])
    const mapa = await buscarHorariosBase(['ABC1234', 'XYZ5678'], '2026-08-25')
    expect(mapa.get('ABC1234')).toEqual({ saidaBase: '2026-08-25T06:00:00.000Z', chegadaBase: '2026-08-25T18:00:00.000Z', kmPercorrido: 203.4 })
    expect(mapa.get('XYZ5678')).toEqual({ saidaBase: null, chegadaBase: null, kmPercorrido: null })
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
      { placa: 'ABC1234', saidaBase: '2026-08-25T09:00:00.000Z', chegadaBase: null, kmPercorrido: 203.4 },
      { placa: 123, saidaBase: null, chegadaBase: null, kmPercorrido: null }, // placa nao e string
      { placa: 'DEF5678', saidaBase: null, chegadaBase: null, kmPercorrido: '203.4' }, // km nao e number
      'nao e objeto',
    ])
    const mapa = await buscarHorariosBase(['ABC1234', 'DEF5678'], '2026-08-25')
    expect(mapa.size).toBe(1)
    expect(mapa.get('ABC1234')).toEqual({ saidaBase: '2026-08-25T06:00:00.000Z', chegadaBase: null, kmPercorrido: 203.4 })
  })

  it('paraBrtMascaradoComoUtc: aceita offset explicito (+02:00 do Postgres, ver TimeZone da role) e converte pro mesmo resultado que Z', async () => {
    // Achado real: PostgREST serializa timestamptz respeitando o TimeZone
    // da role/sessao (Europe/Berlin neste projeto), entao a ponte pode
    // devolver "+02:00" em vez de "Z" -- new Date() resolve os dois pro
    // MESMO instante absoluto, entao o resultado tem que ser identico.
    mockFetchOk([{ placa: 'ABC1234', saidaBase: '2026-08-25T11:00:00.000+02:00', chegadaBase: null, kmPercorrido: null }])
    const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
    // 11:00+02:00 == 09:00 UTC == 06:00 BRT
    expect(mapa.get('ABC1234')).toEqual({ saidaBase: '2026-08-25T06:00:00.000Z', chegadaBase: null, kmPercorrido: null })
  })

  describe('pontosPorPlaca / visitasPorNf (achado real 25/08: CHEGADA/SAIDA NA LOJA via mesma ponte)', () => {
    it('manda pontosPorPlaca no corpo so pras placas que tem pontos', async () => {
      const fetchSpy = mockFetchOk([])
      const pontos = new Map([['ABC1234', [{ id: 'NF1', lat: -22.9, lng: -43.2 }]]])
      await buscarHorariosBase(['ABC1234', 'XYZ5678'], '2026-08-25', pontos)

      const corpo = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
      expect(corpo.pontosPorPlaca).toEqual({ ABC1234: [{ id: 'NF1', lat: -22.9, lng: -43.2 }] })
    })

    it('sem pontosPorPlaca (parametro omitido): manda objeto vazio, comportamento identico a antes desta extensao', async () => {
      const fetchSpy = mockFetchOk([])
      await buscarHorariosBase(['ABC1234'], '2026-08-25')

      const corpo = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
      expect(corpo.pontosPorPlaca).toEqual({})
    })

    it('resposta com visitas: vira Map por NF, com chegada/saida convertidos de UTC real pra BRT mascarado', async () => {
      mockFetchOk([
        {
          placa: 'ABC1234', saidaBase: null, chegadaBase: null, kmPercorrido: null,
          visitas: [
            { id: 'NF1', chegada: '2026-08-25T13:17:00.000Z', saida: '2026-08-25T13:28:00.000Z' },
            { id: 'NF2', chegada: null, saida: null },
          ],
        },
      ])
      const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
      const visitasPorNf = mapa.get('ABC1234')?.visitasPorNf
      expect(visitasPorNf?.get('NF1')).toEqual({ chegada: '2026-08-25T10:17:00.000Z', saida: '2026-08-25T10:28:00.000Z', viaVizinhanca: false })
      expect(visitasPorNf?.get('NF2')).toEqual({ chegada: null, saida: null, viaVizinhanca: false })
    })

    it('resposta sem campo visitas (placa sem pontos pedidos): visitasPorNf fica undefined', async () => {
      mockFetchOk([{ placa: 'ABC1234', saidaBase: null, chegadaBase: null, kmPercorrido: null }])
      const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
      expect(mapa.get('ABC1234')?.visitasPorNf).toBeUndefined()
    })

    it('item de visita malformado e ignorado, sem derrubar os outros da mesma placa', async () => {
      mockFetchOk([
        {
          placa: 'ABC1234', saidaBase: null, chegadaBase: null, kmPercorrido: null,
          visitas: [
            { id: 'NF1', chegada: '2026-08-25T13:00:00.000Z', saida: '2026-08-25T13:10:00.000Z' },
            { id: 123, chegada: null, saida: null }, // id nao e string
          ],
        },
      ])
      const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
      const visitasPorNf = mapa.get('ABC1234')?.visitasPorNf
      expect(visitasPorNf?.size).toBe(1)
      expect(visitasPorNf?.get('NF1')).toEqual({ chegada: '2026-08-25T10:00:00.000Z', saida: '2026-08-25T10:10:00.000Z', viaVizinhanca: false })
    })
  })
})
