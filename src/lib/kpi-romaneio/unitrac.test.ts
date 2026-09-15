import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buscarAlvosDoDia, buscarParadasDoDia, paradasDaPonte, resolverParadas } from './unitrac'
import { BASES_COORD_NUTRIMAX } from './constants'
import { RAIO_CLUSTER_M } from '@/lib/unitrac-api/consolida'
import { hojeBR } from '@/lib/data-br'

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

const { consultarVelocidadeNaParadaMock } = vi.hoisted(() => ({
  consultarVelocidadeNaParadaMock: vi.fn(),
}))

vi.mock('./velocidade-parada', () => ({
  consultarVelocidadeNaParada: consultarVelocidadeNaParadaMock,
}))

beforeEach(() => {
  buscarFrotaMock.mockReset()
  buscarAlvosMock.mockReset()
  buscarStopsCruMock.mockReset()
  consolidaParadasApiMock.mockReset()
  consultarVelocidadeNaParadaMock.mockReset()
  consultarVelocidadeNaParadaMock.mockResolvedValue([])
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

// Item 3a (spec 2026-09-12, "Endurecimento da confirmacao"): paradas
// FORA_BASE do feed da Unitrac sao cruzadas contra o GPS PROPRIO (ponte
// /api/romaneio/velocidade-na-parada) antes de serem devolvidas. Achado
// real 11/09: a Unitrac reportou paradas dentro de 500m de enderecos pras
// placas RQV6I51/TUI1A90/RQV3J99 -- o GPS proprio mostra que essas placas
// nunca chegaram perto. So' BASE fica intocada (nunca cruzada).
describe('buscarParadasDoDia -- 3a, valida FORA_BASE contra GPS proprio', () => {
  const paradaForaBase = { id: 'p1', placa_norm: 'RQV6I51', chegada: '2026-09-11T10:00:00.000Z', saida: '2026-09-11T10:20:00.000Z', fim_real: '2026-09-11T10:18:00.000Z', duracao_seg: 1080, lat: -22.5, lng: -43.1, classificacao: 'FORA_BASE' } as const
  const paradaBase = { id: 'p2', placa_norm: 'RQV6I51', chegada: '2026-09-11T06:00:00.000Z', saida: '2026-09-11T06:30:00.000Z', fim_real: '2026-09-11T06:30:00.000Z', duracao_seg: 1800, lat: -22.83, lng: -43.34, classificacao: 'BASE' } as const

  it('sem cobertura de GPS (temCobertura false): mantem a parada (fail-open)', async () => {
    buscarStopsCruMock.mockResolvedValue([])
    consolidaParadasApiMock.mockReturnValue([paradaForaBase])
    consultarVelocidadeNaParadaMock.mockResolvedValue([{ temParadaComVelocidade: false, temCobertura: false }])

    const r = await buscarParadasDoDia('111', 'RQV6I51', '2026-09-11', 48)

    expect(r).toEqual([paradaForaBase])
  })

  it('coberto mas em movimento (contradicao real): descarta a parada', async () => {
    buscarStopsCruMock.mockResolvedValue([])
    consolidaParadasApiMock.mockReturnValue([paradaForaBase])
    consultarVelocidadeNaParadaMock.mockResolvedValue([{ temParadaComVelocidade: false, temCobertura: true }])

    const r = await buscarParadasDoDia('111', 'RQV6I51', '2026-09-11', 48)

    expect(r).toEqual([])
  })

  it('coberto e corroborado (temParadaComVelocidade true): mantem a parada', async () => {
    buscarStopsCruMock.mockResolvedValue([])
    consolidaParadasApiMock.mockReturnValue([paradaForaBase])
    consultarVelocidadeNaParadaMock.mockResolvedValue([{ temParadaComVelocidade: true, temCobertura: true }])

    const r = await buscarParadasDoDia('111', 'RQV6I51', '2026-09-11', 48)

    expect(r).toEqual([paradaForaBase])
  })

  it('bridge devolve null (falha/entrada malformada): mantem a parada (fail-open)', async () => {
    buscarStopsCruMock.mockResolvedValue([])
    consolidaParadasApiMock.mockReturnValue([paradaForaBase])
    consultarVelocidadeNaParadaMock.mockResolvedValue([null])

    const r = await buscarParadasDoDia('111', 'RQV6I51', '2026-09-11', 48)

    expect(r).toEqual([paradaForaBase])
  })

  it('parada BASE nunca e cruzada -- so FORA_BASE entra na consulta em lote', async () => {
    buscarStopsCruMock.mockResolvedValue([])
    consolidaParadasApiMock.mockReturnValue([paradaBase, paradaForaBase])
    consultarVelocidadeNaParadaMock.mockResolvedValue([{ temParadaComVelocidade: true, temCobertura: true }])

    const r = await buscarParadasDoDia('111', 'RQV6I51', '2026-09-11', 48)

    expect(consultarVelocidadeNaParadaMock).toHaveBeenCalledTimes(1)
    expect(consultarVelocidadeNaParadaMock).toHaveBeenCalledWith([
      { placa: 'RQV6I51', lat: -22.5, lng: -43.1, raioM: RAIO_CLUSTER_M, inicioIso: paradaForaBase.chegada, fimIso: paradaForaBase.fim_real },
    ])
    expect(r).toEqual([paradaBase, paradaForaBase])
  })

  it('duas FORA_BASE viram UMA UNICA chamada em lote pra ponte (nao sequencial)', async () => {
    const outraForaBase = { ...paradaForaBase, id: 'p3', lat: -22.6, lng: -43.2 }
    buscarStopsCruMock.mockResolvedValue([])
    consolidaParadasApiMock.mockReturnValue([paradaForaBase, outraForaBase])
    consultarVelocidadeNaParadaMock.mockResolvedValue([
      { temParadaComVelocidade: true, temCobertura: true },
      { temParadaComVelocidade: false, temCobertura: true },
    ])

    const r = await buscarParadasDoDia('111', 'RQV6I51', '2026-09-11', 48)

    expect(consultarVelocidadeNaParadaMock).toHaveBeenCalledTimes(1)
    expect(r).toEqual([paradaForaBase])
  })

  it('nenhuma parada FORA_BASE: nao chama a ponte', async () => {
    buscarStopsCruMock.mockResolvedValue([])
    consolidaParadasApiMock.mockReturnValue([paradaBase])

    const r = await buscarParadasDoDia('111', 'RQV6I51', '2026-09-11', 48)

    expect(consultarVelocidadeNaParadaMock).not.toHaveBeenCalled()
    expect(r).toEqual([paradaBase])
  })
})

// Achado real 14/09 (Task 7 do motor de confirmacao, regressao medida em
// producao): ao reprocessar um dia PASSADO, a Unitrac pode devolver uma
// UNICA parada BASE que nunca fechou -- chegada no dia pedido, saida/
// fim_real so' em HOJE, como se o veiculo ainda estivesse la agora. Caso
// real 12/09 (RQV6I51 e outras 4 placas): GPS proprio mostrou 90+km
// percorridos e velocidade ate 95km/h no mesmo dia -- a parada e' lixo de
// API. Datas construidas relativas a hojeBR() pra nao depender de qual dia
// e' "hoje" quando a suite rodar.
function subtrairDias(dataBase: string, dias: number): string {
  const d = new Date(`${dataBase}T00:00:00`)
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

describe('buscarParadasDoDia -- descarta parada BASE que nunca fechou (aberta ate hoje) num dia passado', () => {
  const hoje = hojeBR()
  const diaPassado = subtrairDias(hoje, 3)
  const paradaAbertaAteHoje = {
    id: 'p-aberta', placa_norm: 'RQV6I51',
    chegada: `${diaPassado}T23:09:00.000Z`, saida: `${hoje}T07:12:00.000Z`, fim_real: `${hoje}T07:12:00.000Z`,
    duracao_seg: 115_380, lat: -21.6885, lng: -41.3114, classificacao: 'BASE',
  } as const
  const paradaFechadaNoDia = {
    id: 'p-fechada', placa_norm: 'RQV6I51',
    chegada: `${diaPassado}T10:00:00.000Z`, saida: `${diaPassado}T10:30:00.000Z`, fim_real: `${diaPassado}T10:30:00.000Z`,
    duracao_seg: 1800, lat: -21.6885, lng: -41.3114, classificacao: 'BASE',
  } as const

  it('parada BASE que so fecha hoje, pedida pra dia passado: descarta (array fica vazio)', async () => {
    buscarStopsCruMock.mockResolvedValue([])
    consolidaParadasApiMock.mockReturnValue([paradaAbertaAteHoje])

    const r = await buscarParadasDoDia('111', 'RQV6I51', diaPassado, 48)

    expect(r).toEqual([])
  })

  it('parada BASE que fechou dentro do proprio dia passado: mantem', async () => {
    buscarStopsCruMock.mockResolvedValue([])
    consolidaParadasApiMock.mockReturnValue([paradaFechadaNoDia])

    const r = await buscarParadasDoDia('111', 'RQV6I51', diaPassado, 48)

    expect(r).toEqual([paradaFechadaNoDia])
  })

  it('mistura: descarta so a aberta, mantem a fechada', async () => {
    buscarStopsCruMock.mockResolvedValue([])
    consolidaParadasApiMock.mockReturnValue([paradaFechadaNoDia, paradaAbertaAteHoje])

    const r = await buscarParadasDoDia('111', 'RQV6I51', diaPassado, 48)

    expect(r).toEqual([paradaFechadaNoDia])
  })

  it('pedido pro dia de HOJE: parada ainda aberta e normal, nao descarta', async () => {
    buscarStopsCruMock.mockResolvedValue([])
    const aindaAberta = { ...paradaAbertaAteHoje, chegada: `${hoje}T05:00:00.000Z` }
    consolidaParadasApiMock.mockReturnValue([aindaAberta])

    const r = await buscarParadasDoDia('111', 'RQV6I51', hoje, 48)

    expect(r).toEqual([aindaAberta])
  })

  it('parada FORA_BASE tambem e descartada pelo mesmo criterio (nao so BASE)', async () => {
    buscarStopsCruMock.mockResolvedValue([])
    const foraBaseAberta = { ...paradaAbertaAteHoje, id: 'p-fora-aberta', classificacao: 'FORA_BASE' as const }
    consolidaParadasApiMock.mockReturnValue([foraBaseAberta])
    consultarVelocidadeNaParadaMock.mockResolvedValue([{ temParadaComVelocidade: true, temCobertura: true }])

    const r = await buscarParadasDoDia('111', 'RQV6I51', diaPassado, 48)

    expect(r).toEqual([])
    // descartada ANTES da checagem 3a -- nunca chega a consultar a ponte
    expect(consultarVelocidadeNaParadaMock).not.toHaveBeenCalled()
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
// Achado real 14/09 (planejamento da fase que inverte a prioridade de
// fonte de parada): antes, a ponte so' era preferida fora da janela de
// 48h da Unitrac. Agora e' preferida SEMPRE, exceto quando ha' apagao de
// sinal detectado (ver route.ts do monitoramento, teveApagaoDeSinal) --
// nesse caso a ponte pode estar mostrando uma parada FALSA (congelamento
// na ultima posicao conhecida), entao cai pra Unitrac mesmo tendo dado.
describe('resolverParadas', () => {
  const daPonteEx = [
    { chegada: '2026-09-11T10:00:00.000Z', saida: '2026-09-11T10:20:00.000Z', duracaoSeg: 1200, lat: -22.9, lng: -43.2, classificacao: 'FORA_BASE' as const },
  ]
  const daUnitracEx = [{ id: 'unitrac-x' }] as unknown as import('@/lib/kpi/matcher').UnitracParadaRow[]

  it('sem apagao, com dado da ponte: usa a ponte mesmo com a Unitrac tendo devolvido algo (nova prioridade)', () => {
    const r = resolverParadas(daUnitracEx, daPonteEx, 'RQU2G47', false)
    expect(r).toEqual(paradasDaPonte(daPonteEx, 'RQU2G47'))
  })

  it('sem apagao, sem dado nenhum na ponte: cai pro que a Unitrac devolveu (fail-open, nunca erro seco)', () => {
    const r = resolverParadas(daUnitracEx, undefined, 'RQU2G47', false)
    expect(r).toBe(daUnitracEx)
  })

  it('com apagao detectado: usa a Unitrac mesmo com a ponte tendo dado -- a ponte pode estar mostrando parada falsa', () => {
    const r = resolverParadas(daUnitracEx, daPonteEx, 'RQU2G47', true)
    expect(r).toBe(daUnitracEx)
  })

  it('com apagao mas Unitrac sem dado nenhum pra esse dia (fora da janela de 48h): usa a ponte, nao zera o dia (achado 14/09)', () => {
    const r = resolverParadas([], daPonteEx, 'RQU2G47', true)
    expect(r).toEqual(paradasDaPonte(daPonteEx, 'RQU2G47'))
  })

  it('com apagao e sem dado nenhum em nenhum dos dois lados: lista vazia, nunca inventa (fail-open nos dois lados)', () => {
    const r = resolverParadas([], undefined, 'RQU2G47', true)
    expect(r).toEqual([])
  })
})
