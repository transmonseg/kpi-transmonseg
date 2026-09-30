import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  placaCanonicaVisual,
  resolverAliasPlacas,
  buscarHorariosBaseComAlias,
  aplicarAliasEmConjunto,
  placasAliasDaFrota,
  montarCvPorPlaca,
} from './alias-placa'
import { normPlaca } from '@/lib/unitrac-api'

// Caso real 29/09 (relatorio PXS 53707): romaneio/escala diz RQO9H37, a
// frota Unitrac 4096 e a tabela veiculos do monitoramento tem DUAS entradas:
// 'RQO-9H37' (cv 24138, rastreador antigo parado na base, atraso 765-2204
// min) e 'RQ0-9H37' (cv 24343, rastreador novo desde 28/09, GPS completo).

describe('placaCanonicaVisual', () => {
  it('troca 0->O nas 3 primeiras posicoes (sempre letra)', () => {
    expect(placaCanonicaVisual('RQ09H37')).toBe('RQO9H37')
  })
  it('troca O->0 e I->1 nas posicoes sempre digito (4, 6, 7)', () => {
    expect(placaCanonicaVisual('RQV1AIO')).toBe('RQV1A10')
    expect(placaCanonicaVisual('LNNIJ66')).toBe('LNN1J66')
  })
  it('NUNCA mexe na posicao 5 (letra no Mercosul, digito no antigo)', () => {
    expect(placaCanonicaVisual('TTF5I09')).toBe('TTF5I09')
    expect(placaCanonicaVisual('RQO9O37')).toBe('RQO9O37')
    expect(placaCanonicaVisual('RQO9037')).toBe('RQO9037')
  })
  it('placa valida nao muda; tamanho != 7 nao muda', () => {
    expect(placaCanonicaVisual('RQO9H37')).toBe('RQO9H37')
    expect(placaCanonicaVisual('SB419613')).toBe('SB419613')
  })
})

describe('resolverAliasPlacas', () => {
  it('RQO9H37 do romaneio casa com RQ0-9H37 (hifen) da frota', () => {
    const alias = resolverAliasPlacas(['RQO9H37'], ['RQO9H37', normPlaca('RQ0-9H37'), 'TUL1C38'])
    expect(alias.get('RQO9H37')).toEqual(['RQ09H37'])
    expect(alias.size).toBe(1)
  })
  it('romaneio com grafia invalida casa com a placa valida da frota', () => {
    const alias = resolverAliasPlacas(['RQ09H37'], ['RQO9H37'])
    expect(alias.get('RQ09H37')).toEqual(['RQO9H37'])
  })
  it('duas placas VALIDAS distintas nunca se unificam (posicao 5 O vs 0) e loga', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const alias = resolverAliasPlacas(['RQO9O37'], ['RQO9037', 'RQO9O37'])
    expect(alias.size).toBe(0)
    warn.mockRestore()
  })
  it('alias que tambem esta na escala (duas placas no romaneio) nao unifica', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const alias = resolverAliasPlacas(['RQO9H37', 'RQ09H37'], ['RQO9H37', 'RQ09H37'])
    expect(alias.size).toBe(0)
    warn.mockRestore()
  })
  it('placa sem variante na frota: mapa vazio', () => {
    expect(resolverAliasPlacas(['TUL1C38', 'XXX0000'], ['TUL1C38']).size).toBe(0)
  })
})

describe('aplicarAliasEmConjunto / placasAliasDaFrota', () => {
  it('declaracao manual na grafia da frota vale pra placa do romaneio', () => {
    const alias = new Map([['RQO9H37', ['RQ09H37']]])
    expect([...aplicarAliasEmConjunto(new Set(['RQ09H37']), alias)]).toContain('RQO9H37')
    expect([...aplicarAliasEmConjunto(new Set(['TUL1C38']), alias)]).toEqual(['TUL1C38'])
  })
  it('lista as grafias da frota absorvidas pelo romaneio', () => {
    expect(placasAliasDaFrota(new Map([['RQO9H37', ['RQ09H37']]]))).toEqual(new Set(['RQ09H37']))
  })
})

describe('buscarHorariosBaseComAlias', () => {
  beforeEach(() => {
    process.env.MOTOR_SECRET = 'segredo-teste'
    process.env.MONITORAMENTO_URL = 'http://127.0.0.1:3010'
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.MOTOR_SECRET
    delete process.env.MONITORAMENTO_URL
  })

  const parada = { chegada: '2026-09-29T09:32:00Z', saida: '2026-09-29T09:50:00Z', duracaoMin: 18, lat: -22.97, lng: -43.18, classificacao: 'FORA_BASE' }

  it('consulta as duas grafias e fica com a que tem sinal (RQ0-9H37), chaveada pela placa do romaneio', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ resultados: [
        { placa: 'RQO9H37', saidaBase: null, chegadaBase: null, kmPercorrido: 0, paradas: [] },
        { placa: 'RQ09H37', saidaBase: '2026-09-29T09:20:00Z', chegadaBase: null, kmPercorrido: 41.2, paradas: [parada] },
      ] }),
    } as Response)
    const alias = new Map([['RQO9H37', ['RQ09H37']]])
    const pontos = new Map([['RQO9H37', [{ id: 'NF1', lat: -22.97, lng: -43.18 }]]])
    const { horarios, consulta } = await buscarHorariosBaseComAlias(['RQO9H37', 'TUL1C38'], '2026-09-29', pontos, true, alias)

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.placas).toEqual(expect.arrayContaining(['RQO9H37', 'RQ09H37', 'TUL1C38']))
    expect(body.pontosPorPlaca.RQ09H37).toEqual(pontos.get('RQO9H37'))
    expect(horarios.get('RQO9H37')?.kmPercorrido).toBe(41.2)
    expect(horarios.get('RQO9H37')?.paradas).toHaveLength(1)
    expect(horarios.has('RQ09H37')).toBe(false)
    expect(consulta.get('RQO9H37')).toBe('RQ09H37')
  })

  it('empate de sinal fica com a grafia do romaneio', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ resultados: [
        { placa: 'RQO9H37', saidaBase: null, chegadaBase: null, kmPercorrido: 12, paradas: [parada] },
        { placa: 'RQ09H37', saidaBase: null, chegadaBase: null, kmPercorrido: 12, paradas: [parada] },
      ] }),
    } as Response)
    const { consulta } = await buscarHorariosBaseComAlias(['RQO9H37'], '2026-09-29', new Map(), true, new Map([['RQO9H37', ['RQ09H37']]]))
    expect(consulta.get('RQO9H37')).toBe('RQO9H37')
  })

  it('sem alias: identico a buscarHorariosBase (consulta vazia)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ resultados: [{ placa: 'TUL1C38', saidaBase: null, chegadaBase: null, kmPercorrido: 3 }] }),
    } as Response)
    const { horarios, consulta } = await buscarHorariosBaseComAlias(['TUL1C38'], '2026-09-29', new Map(), false, new Map())
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string).placas).toEqual(['TUL1C38'])
    expect(horarios.get('TUL1C38')?.kmPercorrido).toBe(3)
    expect(consulta.size).toBe(0)
  })
})

describe('montarCvPorPlaca', () => {
  const frota = [
    { cv: '24138', placa: 'RQO-9H37', placaNorm: 'RQO9H37' },
    { cv: '24343', placa: 'RQ0-9H37', placaNorm: 'RQ09H37' },
    { cv: '111', placa: 'TUL-1C38', placaNorm: 'TUL1C38' },
  ]
  it('placa do romaneio usa o cv da grafia escolhida pela ponte (paradas Unitrac do rastreador vivo)', () => {
    const m = montarCvPorPlaca(frota, new Map([['RQO9H37', 'RQ09H37']]))
    expect(m.get('RQO9H37')).toBe('24343')
    expect(m.get('TUL1C38')).toBe('111')
  })
  it('sem consulta: exatamente o mapa placaNorm -> cv de antes', () => {
    expect(montarCvPorPlaca(frota, new Map())).toEqual(new Map([['RQO9H37', '24138'], ['RQ09H37', '24343'], ['TUL1C38', '111']]))
  })
  it('romaneio com grafia invalida sem exata na frota ganha cv da variante', () => {
    expect(montarCvPorPlaca([frota[0]], new Map([['RQ09H37', 'RQO9H37']])).get('RQ09H37')).toBe('24138')
  })
})
