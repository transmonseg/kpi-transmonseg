import { describe, it, expect } from 'vitest'
import {
  resolveStoreName3Path,
  type ResolveContext,
  resolveForaBaseGeo,
  type GeoStore,
  scorePair,
  cruzaEscalaUnitrac,
  variantesOcr,
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

// --- Bug C: formato "Rota NN" (Guanabara) — score sempre Infinity vs nome geográfico Unitrac ---
//
// Escala: loja_nome_raw = "Guanabara - Rota 01" → tokens = {ROTA, 01}
// Unitrac: nome_loja = "GUANABARA MADUREIRA" → tokens = {MADUREIRA}
// Score = Infinity → assignOptimal não atribui.
// Rede fallback (linhasSemMatch.length === 1): deve atribuir mesmo sem token em comum.
describe('cruzaEscalaUnitrac — formato Rota NN sem tokens em comum (Bug C)', () => {
  it('Guanabara Rota 01 recebe parada GUANABARA MADUREIRA quando é única linha sem match', async () => {
    const linhas: EscalaLinhaRow[] = [{
      id: 'l-gb1',
      rede_id: 'GUANABARA',
      placa_norm: 'KSG5412',
      loja_nome_raw: 'Guanabara - Rota 01',
      loja_codigo_raw: '1',
      motorista_nome: 'Motorista A',
      carro_ordem: 1,
      data_entrega: '2026-05-20',
    }]
    const paradas: UnitracParadaRow[] = [{
      id: 'p-gb1',
      placa_norm: 'KSG5412',
      chegada: '2026-05-20T10:00:00.000Z',
      saida: '2026-05-20T11:00:00.000Z',
      duracao_seg: 3600,
      local_parada: '4519090 - GUANABARA MADUREIRA',
      codigo_loja: '4519090',
      nome_loja: 'GUANABARA MADUREIRA',
      lat: null,
      lng: null,
      classificacao: 'LOJA',
      ordem: 1,
    }]
    const rotas = await cruzaEscalaUnitrac(linhas, paradas, [])
    expect(rotas).toHaveLength(1)
    expect(rotas[0].paradas).toHaveLength(1)
    expect(rotas[0].paradas[0].nome).toBe('GUANABARA MADUREIRA')
  })

  it('com 2 linhas sem match (ambas Infinity), nenhuma recebe parada pelo rede fallback', async () => {
    const linhas: EscalaLinhaRow[] = [
      {
        id: 'l-gb2a',
        rede_id: 'GUANABARA',
        placa_norm: 'KSG5412',
        loja_nome_raw: 'Guanabara - Rota 01',
        loja_codigo_raw: '1',
        motorista_nome: 'Motorista A',
        carro_ordem: 1,
        data_entrega: '2026-05-20',
      },
      {
        id: 'l-gb2b',
        rede_id: 'GUANABARA',
        placa_norm: 'KSG5412',
        loja_nome_raw: 'Guanabara - Rota 02',
        loja_codigo_raw: '2',
        motorista_nome: 'Motorista A',
        carro_ordem: 2,
        data_entrega: '2026-05-20',
      },
    ]
    const paradas: UnitracParadaRow[] = [
      {
        id: 'p-gb2a',
        placa_norm: 'KSG5412',
        chegada: '2026-05-20T10:00:00.000Z',
        saida: '2026-05-20T11:00:00.000Z',
        duracao_seg: 3600,
        local_parada: '4519090 - GUANABARA MADUREIRA',
        codigo_loja: '4519090',
        nome_loja: 'GUANABARA MADUREIRA',
        lat: null, lng: null,
        classificacao: 'LOJA',
        ordem: 1,
      },
      {
        id: 'p-gb2b',
        placa_norm: 'KSG5412',
        chegada: '2026-05-20T12:00:00.000Z',
        saida: '2026-05-20T13:00:00.000Z',
        duracao_seg: 3600,
        local_parada: '4519091 - GUANABARA MEIER',
        codigo_loja: '4519091',
        nome_loja: 'GUANABARA MEIER',
        lat: null, lng: null,
        classificacao: 'LOJA',
        ordem: 2,
      },
    ]
    // 2 linhas para a mesma placa → linhasOrdenadas.length = 2 → rede fallback não dispara
    const rotas = await cruzaEscalaUnitrac(linhas, paradas, [])
    expect(rotas).toHaveLength(2)
    // Nenhuma linha deve receber parada por rede fallback quando há ambiguidade
    const totalParadas = rotas.reduce((s, r) => s + r.paradas.length, 0)
    expect(totalParadas).toBe(0)
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

// --- variantesOcr: geração de variantes OCR de placa Mercosul ---
// Posição 4 (0-indexed) é onde o Mercosul muda de dígito pra letra/dígito OCR.
// Exemplo: "LGX1J41" → pos 4 = 'J'; OCR pode ler como '9' → "LGX1941".
describe('variantesOcr', () => {
  it('J↔9: placa com "J" na pos 4 gera variante com "9"', () => {
    // "LGX1J41": pos 4 = 'J'
    const v = variantesOcr('LGX1J41')
    expect(v).toContain('LGX1J41')
    expect(v).toContain('LGX1941')
    expect(v).toHaveLength(2)
  })

  it('J↔9: placa com "9" na pos 4 gera variante com "J"', () => {
    // "LGX1941": pos 4 = '9' (escala digitou o char lido pelo OCR)
    const v = variantesOcr('LGX1941')
    expect(v).toContain('LGX1941')
    expect(v).toContain('LGX1J41')
  })

  it('B↔1: placa com "B" na pos 4 gera variante com "1"', () => {
    // "ABCBB12": pos 4 = 'B' → slice(0,4)="ABCB" + "1" + slice(5)="12" = "ABCB112"
    const v = variantesOcr('ABCBB12')
    expect(v).toContain('ABCBB12')
    expect(v).toContain('ABCB112')
  })

  it('E↔4: placa com "E" na pos 4 gera variante com "4"', () => {
    // "XYZDE56": pos 4 = 'E'
    const v = variantesOcr('XYZDE56')
    expect(v).toContain('XYZDE56')
    expect(v).toContain('XYZD456')
  })

  it('char nao-OCR na pos 4 retorna apenas a placa original', () => {
    // "ABCAD12": pos 4 = 'A' — nao e par OCR
    const v = variantesOcr('ABCAD12')
    expect(v).toHaveLength(1)
    expect(v[0]).toBe('ABCAD12')
  })

  it('placa com 8 chars (nao Mercosul) nao gera variante', () => {
    const v = variantesOcr('ABC12345')
    expect(v).toHaveLength(1)
  })
})
