import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { buscarHorariosBase, anexarCoordenadaCadastro } from './base-horarios'

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
    expect(mapa.get('ABC1234')).toEqual({ saidaBase: '2026-08-25T06:00:00.000Z', chegadaBase: '2026-08-25T18:00:00.000Z', kmPercorrido: 203.4, apagaoDeSinal: false })
    expect(mapa.get('XYZ5678')).toEqual({ saidaBase: null, chegadaBase: null, kmPercorrido: null, apagaoDeSinal: false })
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
    expect(mapa.get('ABC1234')).toEqual({ saidaBase: '2026-08-25T06:00:00.000Z', chegadaBase: null, kmPercorrido: 203.4, apagaoDeSinal: false })
  })

  it('paraBrtMascaradoComoUtc: aceita offset explicito (+02:00 do Postgres, ver TimeZone da role) e converte pro mesmo resultado que Z', async () => {
    // Achado real: PostgREST serializa timestamptz respeitando o TimeZone
    // da role/sessao (Europe/Berlin neste projeto), entao a ponte pode
    // devolver "+02:00" em vez de "Z" -- new Date() resolve os dois pro
    // MESMO instante absoluto, entao o resultado tem que ser identico.
    mockFetchOk([{ placa: 'ABC1234', saidaBase: '2026-08-25T11:00:00.000+02:00', chegadaBase: null, kmPercorrido: null }])
    const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
    // 11:00+02:00 == 09:00 UTC == 06:00 BRT
    expect(mapa.get('ABC1234')).toEqual({ saidaBase: '2026-08-25T06:00:00.000Z', chegadaBase: null, kmPercorrido: null, apagaoDeSinal: false })
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
      expect(visitasPorNf?.get('NF1')).toEqual({ chegada: '2026-08-25T10:17:00.000Z', saida: '2026-08-25T10:28:00.000Z', viaVizinhanca: false, viaRaioAmpliado: false })
      expect(visitasPorNf?.get('NF2')).toEqual({ chegada: null, saida: null, viaVizinhanca: false, viaRaioAmpliado: false })
    })

    it('resposta sem campo visitas (placa sem pontos pedidos): visitasPorNf fica undefined', async () => {
      mockFetchOk([{ placa: 'ABC1234', saidaBase: null, chegadaBase: null, kmPercorrido: null }])
      const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
      expect(mapa.get('ABC1234')?.visitasPorNf).toBeUndefined()
    })

    // Achado real 06/09 (RAIO_AMPLIADO_M do lado do monitoramento): a ponte
    // pode confirmar por dwell no PROPRIO endereco so' no raio ampliado
    // (500-800m) -- repassa viaRaioAmpliado igual ja fazia com viaVizinhanca.
    it('visita com viaRaioAmpliado=true na resposta: repassado pro Map, nao perdido', async () => {
      mockFetchOk([
        {
          placa: 'ABC1234', saidaBase: null, chegadaBase: null, kmPercorrido: null,
          visitas: [{ id: 'NF1', chegada: '2026-08-25T13:00:00.000Z', saida: '2026-08-25T13:10:00.000Z', viaRaioAmpliado: true }],
        },
      ])
      const mapa = await buscarHorariosBase(['ABC1234'], '2026-08-25')
      const visitasPorNf = mapa.get('ABC1234')?.visitasPorNf
      expect(visitasPorNf?.get('NF1')).toEqual({ chegada: '2026-08-25T10:00:00.000Z', saida: '2026-08-25T10:10:00.000Z', viaVizinhanca: false, viaRaioAmpliado: true })
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
      expect(visitasPorNf?.get('NF1')).toEqual({ chegada: '2026-08-25T10:00:00.000Z', saida: '2026-08-25T10:10:00.000Z', viaVizinhanca: false, viaRaioAmpliado: false })
    })
  })

  describe('fimRotaPorPlaca (achado real 22/09: ajuste de CHEGADA CD apos ultima entrega)', () => {
    it('manda fimRotaPorPlaca convertido de mascarado (+3h) pra UTC real', async () => {
      const fetchSpy = mockFetchOk([])
      const fimRota = new Map([['RBG5G18', '2026-09-21T13:59:00.000Z']])
      await buscarHorariosBase(['RBG5G18'], '2026-09-21', new Map(), false, fimRota)

      const corpo = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
      expect(corpo.fimRotaPorPlaca).toEqual({ RBG5G18: '2026-09-21T16:59:00.000Z' })
    })

    it('sem o 5o argumento: corpo nao tem a chave fimRotaPorPlaca', async () => {
      const fetchSpy = mockFetchOk([])
      await buscarHorariosBase(['RBG5G18'], '2026-09-21')

      const corpo = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
      expect(corpo).not.toHaveProperty('fimRotaPorPlaca')
    })
  })

  describe('apagaoDeSinal (achado real 14/09: leitura com atraso_min acima do limiar de apagao)', () => {
    it('repassa apagaoDeSinal quando a ponte manda true', async () => {
      mockFetchOk([
        { placa: 'RQU2G47', saidaBase: null, chegadaBase: null, kmPercorrido: null, apagaoDeSinal: true },
      ])
      const mapa = await buscarHorariosBase(['RQU2G47'], '2026-09-11', new Map(), true)
      expect(mapa.get('RQU2G47')?.apagaoDeSinal).toBe(true)
    })

    it('apagaoDeSinal vira false quando ausente ou malformado -- nunca undefined pro chamador', async () => {
      mockFetchOk([{ placa: 'RQU2G47', saidaBase: null, chegadaBase: null, kmPercorrido: null }])
      const mapa = await buscarHorariosBase(['RQU2G47'], '2026-09-11', new Map(), true)
      expect(mapa.get('RQU2G47')?.apagaoDeSinal).toBe(false)
    })
  })
})

describe('latAlt/lngAlt (cadastro Unitrac)', () => {
  const alvo = (o: Record<string, unknown>) => ({ placaNorm: 'AAA1A11', documento: '100', situacao: 1, pontoLat: -22.1, pontoLng: -43.2, ...o })
  const pontos = () => new Map([['AAA1A11', [{ id: '100', lat: -22, lng: -43 }, { id: '200', lat: -22.5, lng: -43.5 }]]])

  it('anexa latAlt/lngAlt quando o alvo casa por placa+NF e tem cadastro valido', () => {
    const r = anexarCoordenadaCadastro(pontos(), [alvo({})])
    expect(r.get('AAA1A11')![0]).toEqual({ id: '100', lat: -22, lng: -43, latAlt: -22.1, lngAlt: -43.2 })
    expect(r.get('AAA1A11')![1]).toEqual({ id: '200', lat: -22.5, lng: -43.5 })
  })

  it('alvo sem cadastro (null/0/NaN/so um dos dois) nao anexa nada', () => {
    for (const o of [{ pontoLat: null, pontoLng: null }, { pontoLat: 0, pontoLng: 0 }, { pontoLat: NaN, pontoLng: -43 }, { pontoLat: -22.1, pontoLng: null }]) {
      const p = anexarCoordenadaCadastro(pontos(), [alvo(o)]).get('AAA1A11')![0]
      expect('latAlt' in p).toBe(false)
      expect('lngAlt' in p).toBe(false)
    }
  })

  it('snapshot antigo sem pontoLat/pontoLng e placa diferente nao quebram', () => {
    const antigo = { placaNorm: 'AAA1A11', documento: '100', situacao: 1 }
    expect(anexarCoordenadaCadastro(pontos(), [antigo]).get('AAA1A11')![0]).toEqual({ id: '100', lat: -22, lng: -43 })
    expect(anexarCoordenadaCadastro(pontos(), [alvo({ placaNorm: 'ZZZ9Z99' })]).get('AAA1A11')![0]).toEqual({ id: '100', lat: -22, lng: -43 })
  })

  it('alvo pendente (situacao 0) com cadastro: envia latAlt/lngAlt mas nunca feitoEm', () => {
    const p = anexarCoordenadaCadastro(pontos(), [alvo({ situacao: 0, feitoISO: null })]).get('AAA1A11')![0]
    expect(p).toEqual({ id: '100', lat: -22, lng: -43, latAlt: -22.1, lngAlt: -43.2 })
  })

  it('alvo situacao 98 (outro) com feitoISO e cadastro: envia latAlt/lngAlt e feitoEm', () => {
    const p = anexarCoordenadaCadastro(pontos(), [alvo({ situacao: 98, feitoISO: '2026-09-22T10:03:58.140012' })]).get('AAA1A11')![0]
    expect(p).toEqual({ id: '100', lat: -22, lng: -43, latAlt: -22.1, lngAlt: -43.2, feitoEm: '2026-09-22T13:03:58.140Z' })
  })

  it('alvo feito + alvo nao feito na mesma NF: usa so o feito', () => {
    const p = anexarCoordenadaCadastro(pontos(), [alvo({ feitoISO: '2026-09-22T07:04:00' }), alvo({ situacao: 0, pontoLat: -1, pontoLng: -1 })]).get('AAA1A11')![0]
    expect(p).toMatchObject({ latAlt: -22.1, lngAlt: -43.2 })
  })

  it('dois alvos feitos com feito divergente (>5 min): nao envia latAlt/lngAlt/feitoEm', () => {
    const p = anexarCoordenadaCadastro(pontos(), [alvo({ feitoISO: '2026-09-22T07:04:00' }), alvo({ feitoISO: '2026-09-22T08:30:00', pontoLat: -22.3 })]).get('AAA1A11')![0]
    expect(p).toEqual({ id: '100', lat: -22, lng: -43 })
  })

  describe('feitoEm (horario feito da Unitrac, UTC real)', () => {
    it('converte feitoISO (digitos de Brasilia) para UTC real (+3h)', () => {
      const p = anexarCoordenadaCadastro(pontos(), [alvo({ feitoISO: '2026-09-22T07:04:00' })]).get('AAA1A11')![0]
      expect(p.feitoEm).toBe('2026-09-22T10:04:00.000Z')
    })
    it('anexa feitoEm mesmo sem cadastro valido, e nao anexa latAlt nesse caso', () => {
      const p = anexarCoordenadaCadastro(pontos(), [alvo({ pontoLat: null, pontoLng: null, feitoISO: '2026-09-22T07:04:00' })]).get('AAA1A11')![0]
      expect(p.feitoEm).toBe('2026-09-22T10:04:00.000Z')
      expect('latAlt' in p).toBe(false)
    })
    it('feitoISO ausente, null ou invalido: sem feitoEm', () => {
      for (const feitoISO of [undefined, null, 'lixo', '']) {
        const p = anexarCoordenadaCadastro(pontos(), [alvo({ feitoISO })]).get('AAA1A11')![0]
        expect('feitoEm' in p).toBe(false)
      }
    })
    it('body enviado a ponte inclui feitoEm', async () => {
      const spy = mockFetchOk([])
      await buscarHorariosBase(['AAA1A11'], '2026-09-22', anexarCoordenadaCadastro(pontos(), [alvo({ feitoISO: '2026-09-22T07:04:00' })]))
      const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
      expect(body.pontosPorPlaca.AAA1A11[0].feitoEm).toBe('2026-09-22T10:04:00.000Z')
    })
  })

  it('nao muta a entrada', () => {
    const p = pontos()
    anexarCoordenadaCadastro(p, [alvo({})])
    expect('latAlt' in p.get('AAA1A11')![0]).toBe(false)
  })

  it('body enviado a ponte inclui latAlt/lngAlt quando presentes e omite quando ausentes', async () => {
    const spy = mockFetchOk([])
    await buscarHorariosBase(['AAA1A11'], '2026-09-20', anexarCoordenadaCadastro(pontos(), [alvo({})]))
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.pontosPorPlaca.AAA1A11[0]).toMatchObject({ latAlt: -22.1, lngAlt: -43.2 })
    expect(Object.keys(body.pontosPorPlaca.AAA1A11[1])).toEqual(['id', 'lat', 'lng'])
  })
})

describe('feitoEm (fuso)', () => {
  it('feitoISO com Z mentiroso ou offset vira o MESMO instante real (digitos BRT + 3h)', () => {
    const pontos = new Map([['AAA1A11', [{ id: '100', lat: 1, lng: 2 }]]])
    const mk = (feitoISO: string) => anexarCoordenadaCadastro(pontos, [{ placaNorm: 'AAA1A11', documento: '100', situacao: 1, feitoISO }]).get('AAA1A11')![0].feitoEm
    expect(mk('2026-09-22T10:20:00')).toBe('2026-09-22T13:20:00.000Z')
    expect(mk('2026-09-22T10:20:00Z')).toBe('2026-09-22T13:20:00.000Z')
    expect(mk('2026-09-22T10:20:00-03:00')).toBe('2026-09-22T13:20:00.000Z')
  })
})
