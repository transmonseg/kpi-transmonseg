import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buscarAlvosDoDia, buscarParadasDoDia, paradasDaPonte, resolverParadas } from './unitrac'
import { BASES_COORD_NUTRIMAX } from './constants'

const { buscarFrotaMock, buscarAlvosMock, buscarStopsCruMock, consolidaParadasApiMock } = vi.hoisted(() => ({
  buscarFrotaMock: vi.fn(),
  buscarAlvosMock: vi.fn(),
  buscarStopsCruMock: vi.fn(),
  consolidaParadasApiMock: vi.fn(),
}))

vi.mock('@/lib/unitrac-api', () => ({
  buscarFrota: buscarFrotaMock,
  buscarAlvos: buscarAlvosMock,
  buscarStopsCru: buscarStopsCruMock,
  consolidaParadasApi: consolidaParadasApiMock,
}))

beforeEach(() => {
  buscarFrotaMock.mockReset()
  buscarAlvosMock.mockReset()
  buscarStopsCruMock.mockReset()
  consolidaParadasApiMock.mockReset()
})

describe('buscarAlvosDoDia', () => {
  it('filtra a frota certa pelas placas pedidas e busca alvos só dos cv correspondentes', async () => {
    buscarFrotaMock.mockResolvedValue([
      { cv: '111', placa: 'TUL-1C38', placaNorm: 'TUL1C38' },
      { cv: '222', placa: 'TUI-1A90', placaNorm: 'TUI1A90' },
      { cv: '333', placa: 'ABC-9999', placaNorm: 'ABC9999' },
    ])
    buscarAlvosMock.mockResolvedValue([{ placaNorm: 'TUL1C38' }])

    const r = await buscarAlvosDoDia(['TUL1C38'])

    expect(buscarFrotaMock).toHaveBeenCalled()
    expect(buscarAlvosMock).toHaveBeenCalledWith(['111'])
    expect(r).toEqual([{ placaNorm: 'TUL1C38' }])
  })

  it('placa sem correspondencia na frota nao gera cv e nao quebra (retorna [] sem chamar buscarAlvos)', async () => {
    buscarFrotaMock.mockResolvedValue([
      { cv: '111', placa: 'TUL-1C38', placaNorm: 'TUL1C38' },
    ])

    const r = await buscarAlvosDoDia(['ZZZ0000'])

    expect(r).toEqual([])
    expect(buscarAlvosMock).not.toHaveBeenCalled()
  })
})

describe('buscarParadasDoDia', () => {
  it('busca stops crus e consolida com pontos={} e as duas bases da Nutrimax', async () => {
    const eventos = [{ _data: '2026-08-20T10:00:00', tempoparada: 60, latitude: -22.8, longitude: -43.2 }]
    buscarStopsCruMock.mockResolvedValue(eventos)
    consolidaParadasApiMock.mockReturnValue([{ id: 'x' }])

    const r = await buscarParadasDoDia('111', 'TUL1C38', '2026-08-20', 48)

    expect(buscarStopsCruMock).toHaveBeenCalledWith('111', 48)
    expect(consolidaParadasApiMock).toHaveBeenCalledWith(eventos, {}, '2026-08-20', 'TUL1C38', BASES_COORD_NUTRIMAX)
    expect(r).toEqual([{ id: 'x' }])
  })
})

// Achado real 12/09: dia fora das 48h da Unitrac passa a usar as paradas
// derivadas do historico permanente do monitoramento.
describe('paradasDaPonte', () => {
  const daPonte = [
    { chegada: '2026-09-10T10:00:00.000Z', saida: '2026-09-10T10:20:00.000Z', duracaoSeg: 1200, lat: -22.9, lng: -43.2, classificacao: 'FORA_BASE' as const },
    { chegada: '2026-09-10T18:00:00.000Z', saida: '2026-09-10T18:40:00.000Z', duracaoSeg: 2400, lat: -22.81, lng: -43.27, classificacao: 'BASE' as const },
  ]

  it('converte pro formato que o pipeline ja consome, preservando horario/coordenada/classificacao', () => {
    const [fora, base] = paradasDaPonte(daPonte, 'RQU2G47')

    expect(fora).toMatchObject({
      placa_norm: 'RQU2G47',
      chegada: '2026-09-10T10:00:00.000Z',
      saida: '2026-09-10T10:20:00.000Z',
      duracao_seg: 1200,
      lat: -22.9,
      lng: -43.2,
      classificacao: 'FORA_BASE',
      ordem: 1,
    })
    expect(base.classificacao).toBe('BASE')
    expect(base.ordem).toBe(2)
  })

  it('fim_real coincide com a saida (a ponte devolve o fim REAL da permanencia, nao a chegada do proximo lugar)', () => {
    const [p] = paradasDaPonte(daPonte, 'RQU2G47')
    expect(p.fim_real).toBe(p.saida)
  })

  it('nunca inventa geofence de loja -- codigo_loja/nome_loja ficam null, mesma granularidade de buscarParadasDoDia', () => {
    const [p] = paradasDaPonte(daPonte, 'RQU2G47')
    expect(p.codigo_loja).toBeNull()
    expect(p.nome_loja).toBeNull()
  })

  it('lista vazia devolve lista vazia (sem dado da ponte, pipeline segue sem parada)', () => {
    expect(paradasDaPonte([], 'RQU2G47')).toEqual([])
  })
})

// Achado real 11/09 (regeneracao do dia 11 feita em 13/09): a Unitrac conta
// as 48h pra tras de AGORA, nao da data pedida -- regenerar um dia de dois
// dias atras devolve so' uma FATIA parcial daquele dia (tipicamente so' as
// horas de madrugada, caminhao parado na base). Escolher a fonte por
// "a API devolveu algo?" faz esse retalho passar como se fosse o dia
// inteiro, e agregacao.ts conclui NUNCA SAIU DA BASE. A escolha tem que ser
// por "a data pedida esta fora do alcance da API?", nao por len>0.
describe('resolverParadas', () => {
  const daPonteEx = [
    { chegada: '2026-09-11T10:00:00.000Z', saida: '2026-09-11T10:20:00.000Z', duracaoSeg: 1200, lat: -22.9, lng: -43.2, classificacao: 'FORA_BASE' as const },
  ]
  const daUnitracParcial = [{ id: 'so-madrugada-na-base' }] as unknown as import('@/lib/kpi/matcher').UnitracParadaRow[]

  it('fora da janela: usa a ponte mesmo com a Unitrac tendo devolvido uma fatia parcial (o bug real)', () => {
    const r = resolverParadas(daUnitracParcial, daPonteEx, 'RQU2G47', true)
    expect(r).toEqual(paradasDaPonte(daPonteEx, 'RQU2G47'))
  })

  it('fora da janela sem dado nenhum na ponte: cai pro que a Unitrac devolveu (fail-open, nunca erro seco)', () => {
    const r = resolverParadas(daUnitracParcial, undefined, 'RQU2G47', true)
    expect(r).toBe(daUnitracParcial)
  })

  it('dentro da janela com dado da Unitrac: comportamento de hoje intocado, usa a Unitrac mesmo com ponte disponivel', () => {
    const r = resolverParadas(daUnitracParcial, daPonteEx, 'RQU2G47', false)
    expect(r).toBe(daUnitracParcial)
  })

  it('dentro da janela sem dado nenhum da Unitrac: comportamento de hoje intocado, cai pra ponte', () => {
    const r = resolverParadas([], daPonteEx, 'RQU2G47', false)
    expect(r).toEqual(paradasDaPonte(daPonteEx, 'RQU2G47'))
  })
})
