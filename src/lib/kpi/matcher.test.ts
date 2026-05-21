import { describe, it, expect } from 'vitest'
import {
  resolveStoreName3Path,
  type ResolveContext,
  resolveForaBaseGeo,
  type GeoStore,
  scorePair,
  cruzaEscalaUnitrac,
  type EscalaLinhaRow,
  type UnitracParadaRow,
  type LojaRow,
} from './matcher'

describe('resolveStoreName3Path', () => {
  const ctx: ResolveContext = {
    aliases: {
      'assai': { canonical_nm: 'Assai', canonical_id: 'a1', score: 1.0 }
    },
    trgmResults: {
      'zona sul': { canonical_nm: 'Zona Sul', canonical_id: 'z1', trgm_score: 0.85, match_source: 'canonical' as const }
    }
  }

  it('path 1: alias exato retorna HIGH confidence', () => {
    const r = resolveStoreName3Path('assai', ctx)
    expect(r.confidence).toBe('HIGH')
    expect(r.algorithm).toBe('alias')
    expect(r.requiresReview).toBe(false)
  })

  it('path 2: trgm acima de threshold retorna resultado', () => {
    const r = resolveStoreName3Path('zona sul', ctx)
    expect(r.algorithm).toBe('trgm')
    expect(['HIGH', 'LOW']).toContain(r.confidence)
  })

  it('path 3: nome desconhecido retorna UNMATCHED + requiresReview', () => {
    const r = resolveStoreName3Path('xyzloja', ctx)
    expect(r.confidence).toBe('UNMATCHED')
    expect(r.requiresReview).toBe(true)
    expect(r.algorithm).toBe('none')
  })
})

describe('resolveForaBaseGeo', () => {
  const stores: GeoStore[] = [
    { id: 'a1', name: 'Assai Jacarepagua', lat: -22.9503, lng: -43.3650, raio_metros: 300 }
  ]

  it('retorna match para parada dentro do raio', () => {
    // ~50m from store
    const r = resolveForaBaseGeo(-22.9500, -43.3648, stores)
    expect(r).not.toBeNull()
    expect(r!.name).toBe('Assai Jacarepagua')
  })

  it('retorna null para parada fora do raio', () => {
    // ~5km from store
    const r = resolveForaBaseGeo(-22.9900, -43.4000, stores)
    expect(r).toBeNull()
  })

  it('retorna null quando lojas nao tem lat/lng', () => {
    const noGeo: GeoStore[] = [{ id: 'x', name: 'X', lat: null, lng: null, raio_metros: 300 }]
    expect(resolveForaBaseGeo(-22.9500, -43.3648, noGeo)).toBeNull()
  })
})

// --- Bug A: scorePair deve testar todas as geofences sobrepostas ---
//
// Cenário real: Escala ALHAMBRA (codigo 21469000); Unitrac concatena
// "17659001 - O BOM CAMPO GRANDE,21469000 - EMANUEL ALHAMBRA". O parser
// salva codigo_loja/nome_loja da PRIMEIRA geofence. Sem o fix, scorePair
// compara "ALHAMBRA" com "O BOM CAMPO GRANDE" → Infinity → sem rastreador.
describe('scorePair — geofences sobrepostas (Bug A)', () => {
  function makeLine(overrides: Partial<EscalaLinhaRow> = {}): EscalaLinhaRow {
    return {
      id: 'l1',
      rede_id: 'r1',
      placa_norm: 'ABC1234',
      loja_nome_raw: 'ALHAMBRA',
      loja_codigo_raw: '21469000',
      motorista_nome: 'Emanuel',
      carro_ordem: 1,
      data_entrega: '2026-05-20',
      ...overrides,
    }
  }

  function makeParada(overrides: Partial<UnitracParadaRow> = {}): UnitracParadaRow {
    return {
      id: 'p1',
      placa_norm: 'ABC1234',
      chegada: '2026-05-20T10:00:00.000Z',
      saida: '2026-05-20T11:00:00.000Z',
      duracao_seg: 3600,
      local_parada: '17659001 - O BOM CAMPO GRANDE,21469000 - EMANUEL ALHAMBRA',
      codigo_loja: '17659001',
      nome_loja: 'O BOM CAMPO GRANDE',
      lat: null,
      lng: null,
      classificacao: 'LOJA',
      ordem: 1,
      ...overrides,
    }
  }

  it('geofence relevante na 2a posicao por CODIGO -> score 0', () => {
    const line = makeLine()
    const parada = makeParada()
    const s = scorePair(line, parada)
    expect(s).toBe(0)
  })

  it('geofence relevante na 2a posicao por NOME -> score finito', () => {
    // Mesmo cenário, mas sem usar match de código (codigos diferentes da escala).
    const line = makeLine({ loja_codigo_raw: null })
    const parada = makeParada({ codigo_loja: null })
    const s = scorePair(line, parada)
    expect(s).toBeLessThan(Infinity)
  })

  it('geofence relevante na 3a posicao (3+ paradas sobrepostas)', () => {
    const line = makeLine({ loja_nome_raw: 'GAVEA', loja_codigo_raw: '5555' })
    const parada = makeParada({
      local_parada: '1111 - LOJA ALPHA,2222 - LOJA BETA,5555 - LOJA GAVEA',
      codigo_loja: '1111',
      nome_loja: 'LOJA ALPHA',
    })
    const s = scorePair(line, parada)
    expect(s).toBe(0)
  })

  it('comportamento preservado: sem multiplas geofences, score continua valido', () => {
    const line = makeLine({ loja_nome_raw: 'ALHAMBRA', loja_codigo_raw: '21469000' })
    const parada = makeParada({
      local_parada: '21469000 - EMANUEL ALHAMBRA',
      codigo_loja: '21469000',
      nome_loja: 'EMANUEL ALHAMBRA',
    })
    expect(scorePair(line, parada)).toBe(0)
  })

  it('Infinity quando nenhuma geofence sobreposta bate', () => {
    const line = makeLine({ loja_nome_raw: 'PETROPOLIS', loja_codigo_raw: '9999' })
    const parada = makeParada({
      local_parada: '1111 - LOJA ALPHA,2222 - LOJA BETA',
      codigo_loja: '1111',
      nome_loja: 'LOJA ALPHA',
    })
    expect(scorePair(line, parada)).toBe(Infinity)
  })
})

// --- Bug B: saida_cd fallback quando veiculo nunca passou pela BASE BENASSI ---
describe('cruzaEscalaUnitrac — saida_cd fallback sem BASE (Bug B)', () => {
  const lojas: LojaRow[] = [
    {
      id: 'loja1',
      rede_id: 'r1',
      nome: 'Cliente Foo',
      nome_normalizado: 'cliente foo',
      codigo_escala: '7777',
      codigo_unitrac: '7777',
      nome_unitrac: 'CLIENTE FOO',
      lat: null,
      lng: null,
      raio_metros: 300,
    },
  ]

  const linha: EscalaLinhaRow = {
    id: 'el1',
    rede_id: 'r1',
    placa_norm: 'XYZ9876',
    loja_nome_raw: 'CLIENTE FOO',
    loja_codigo_raw: '7777',
    motorista_nome: 'Joao',
    carro_ordem: 1,
    data_entrega: '2026-05-20',
  }

  it('rota com GPS mas SEM parada BASE -> saida_cd = chegada da 1a loja', async () => {
    const paradas: UnitracParadaRow[] = [
      {
        id: 'pa',
        placa_norm: 'XYZ9876',
        chegada: '2026-05-20T08:30:00.000Z',
        saida: '2026-05-20T10:00:00.000Z',
        duracao_seg: 5400,
        local_parada: '7777 - CLIENTE FOO',
        codigo_loja: '7777',
        nome_loja: 'CLIENTE FOO',
        lat: null,
        lng: null,
        classificacao: 'LOJA',
        ordem: 1,
      },
    ]
    const rotas = await cruzaEscalaUnitrac([linha], paradas, lojas)
    expect(rotas).toHaveLength(1)
    expect(rotas[0].saida_cd).not.toBeNull()
    expect(rotas[0].saida_cd!.toISOString()).toBe('2026-05-20T08:30:00.000Z')
  })

  it('rota com GPS E parada BASE -> saida_cd = saida da BASE (comportamento preservado)', async () => {
    const paradas: UnitracParadaRow[] = [
      {
        id: 'pb',
        placa_norm: 'XYZ9876',
        chegada: '2026-05-20T06:00:00.000Z',
        saida: '2026-05-20T07:00:00.000Z',
        duracao_seg: 3600,
        local_parada: 'BASE BENASSI',
        codigo_loja: null,
        nome_loja: null,
        lat: null,
        lng: null,
        classificacao: 'BASE',
        ordem: 1,
      },
      {
        id: 'pc',
        placa_norm: 'XYZ9876',
        chegada: '2026-05-20T08:30:00.000Z',
        saida: '2026-05-20T10:00:00.000Z',
        duracao_seg: 5400,
        local_parada: '7777 - CLIENTE FOO',
        codigo_loja: '7777',
        nome_loja: 'CLIENTE FOO',
        lat: null,
        lng: null,
        classificacao: 'LOJA',
        ordem: 2,
      },
    ]
    const rotas = await cruzaEscalaUnitrac([linha], paradas, lojas)
    expect(rotas).toHaveLength(1)
    expect(rotas[0].saida_cd).not.toBeNull()
    expect(rotas[0].saida_cd!.toISOString()).toBe('2026-05-20T07:00:00.000Z')
  })
})

// --- PETROPOLIS como token discriminante (não deve estar em REDES_TOKEN) ---
//
// "CAB PETROPOLIS" e "CAB - PETROPOLIS" têm tokens = {PETROPOLIS} quando CAB
// está em REDES_TOKEN mas PETROPOLIS não. Antes PETROPOLIS estava em REDES_TOKEN,
// fazendo tokensCore("CAB - PETROPOLIS") = {} → matchScore Infinity sempre.
describe('scorePair — PETROPOLIS como token discriminante', () => {
  const linhaCAB: EscalaLinhaRow = {
    id: 'l-cab',
    rede_id: 'CAB_PETROPOLIS',
    placa_norm: 'UBF5G36',
    loja_nome_raw: 'CAB PETROPOLIS',
    loja_codigo_raw: null,
    motorista_nome: 'Motorista X',
    carro_ordem: 1,
    data_entrega: '2026-05-18',
  }

  it('CAB escala bate com parada "CAB - PETROPOLIS" -> score 0', () => {
    const parada: UnitracParadaRow = {
      id: 'p-cab',
      placa_norm: 'UBF5G36',
      chegada: '2026-05-18T10:00:00.000Z',
      saida: '2026-05-18T11:30:00.000Z',
      duracao_seg: 5400,
      local_parada: 'BASE BENASSI - BASE BENASSI,7012010 - CAB - PETROPOLIS',
      codigo_loja: '7012010',
      nome_loja: 'CAB - PETROPOLIS',
      lat: null,
      lng: null,
      classificacao: 'LOJA',
      ordem: 2,
    }
    expect(scorePair(linhaCAB, parada)).toBe(0)
  })

  it('CAB PETROPOLIS NAO bate com parada de rede diferente sem token comum', () => {
    const parada: UnitracParadaRow = {
      id: 'p-other',
      placa_norm: 'UBF5G36',
      chegada: '2026-05-18T10:00:00.000Z',
      saida: '2026-05-18T11:00:00.000Z',
      duracao_seg: 3600,
      local_parada: '8888 - LOJA ALFA BARRA',
      codigo_loja: '8888',
      nome_loja: 'LOJA ALFA BARRA',
      lat: null,
      lng: null,
      classificacao: 'LOJA',
      ordem: 1,
    }
    expect(scorePair(linhaCAB, parada)).toBe(Infinity)
  })
})
