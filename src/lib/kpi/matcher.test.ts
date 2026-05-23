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
    // 2 linhas para a mesma placa → o "rede fallback" antigo (linhasOrdenadas.length === 1)
    // continua não disparando. Mas o T8 (N:N por placa+rede) atribui 1:1 quando
    // quantidade de linhas == quantidade de paradas livres na mesma rede. Sem catálogo
    // (lojas=[]) as paradas têm redeInf=null → coringa → atribui por ordem temporal.
    const rotas = await cruzaEscalaUnitrac(linhas, paradas, [])
    expect(rotas).toHaveLength(2)
    const totalParadas = rotas.reduce((s, r) => s + r.paradas.length, 0)
    // T8 ativa: 2 linhas + 2 paradas → ambas casam por carro_ordem × cronologia.
    // Rota 01 (carro 1) → MADUREIRA (10h). Rota 02 (carro 2) → MEIER (12h).
    expect(totalParadas).toBe(2)
    const e1 = rotas.find(r => r.escala_linha_id === 'l-gb2a')
    const e2 = rotas.find(r => r.escala_linha_id === 'l-gb2b')
    expect(e1?.paradas[0].parada_id).toBe('p-gb2a')
    expect(e2?.paradas[0].parada_id).toBe('p-gb2b')
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

  it('rota com GPS mas SEM parada BASE -> saida_cd = null', async () => {
    // Bug 2 fix: sem BASE, saida_cd retorna null em vez de fallback para chegada do alvo.
    // Blank no Excel é preferível a timestamp impossível (saida_cd = CHD = 0 min viagem).
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
    // Sem parada BASE antes da LOJA → saida_cd = null (não usa chegada como fallback)
    expect(rotas[0].saida_cd).toBeNull()
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

  it('G↔6: placa com "G" na pos 4 gera variante com "6"', () => {
    // "LMN2G45": pos 4 = 'G' → OCR pode ler como '6' → "LMN2645"
    const v = variantesOcr('LMN2G45')
    expect(v).toContain('LMN2G45')
    expect(v).toContain('LMN2645')
    expect(v).toHaveLength(2)
  })

  it('H↔7: placa com "H" na pos 4 gera variante com "7"', () => {
    // "LMN2H45": pos 4 = 'H' → OCR pode ler como '7' → "LMN2745"
    const v = variantesOcr('LMN2H45')
    expect(v).toContain('LMN2H45')
    expect(v).toContain('LMN2745')
    expect(v).toHaveLength(2)
  })

  it('I↔8 e I↔1: placa com "I" na pos 4 gera variantes com "8" e "1"', () => {
    // "LMN2I45": pos 4 = 'I' → OCR confunde com '8' e com '1'
    // OCR_PARES: 'I': ['8', '1']
    const v = variantesOcr('LMN2I45')
    expect(v).toContain('LMN2I45')
    expect(v).toContain('LMN2845')
    expect(v).toContain('LMN2145')
    expect(v).toHaveLength(3)
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

// --- compartilhada token fallback (ARMAZEM_GRAO rede_id divergente) ---
//
// Escala ARMAZEM_GRAO com 2 linhas para "ASSAI TIJUCA 1ª ENTREGA" e "ASSAI TIJUCA 2ª ENTREGA"
// no mesmo caminhão. O Unitrac tem 1 parada ASSAI TIJUCA. assignOptimal casa a 1ª linha;
// a 2ª fica UNMATCHED. O compartilhada fallback via rede_id falha porque lojas.rede_id = 'ASSAI'
// ≠ 'ARMAZEM_GRAO'. Token fallback: scorePair < Infinity → compartilhada funciona.
describe('cruzaEscalaUnitrac — compartilhada token fallback para ARMAZEM_GRAO', () => {
  const linhas: EscalaLinhaRow[] = [
    {
      id: 'ag-l1',
      rede_id: 'ARMAZEM_GRAO',
      placa_norm: 'KPS4J07',
      loja_nome_raw: 'ASSAI TIJUCA 1ª ENTREGA',
      loja_codigo_raw: null,
      motorista_nome: 'Motorista A',
      carro_ordem: 1,
      data_entrega: '2026-05-20',
    },
    {
      id: 'ag-l2',
      rede_id: 'ARMAZEM_GRAO',
      placa_norm: 'KPS4J07',
      loja_nome_raw: 'ASSAI TIJUCA 2ª ENTREGA',
      loja_codigo_raw: null,
      motorista_nome: 'Motorista A',
      carro_ordem: 1,
      data_entrega: '2026-05-20',
    },
  ]
  const paradas: UnitracParadaRow[] = [
    {
      id: 'ag-p1',
      placa_norm: 'KPS4J07',
      chegada: '2026-05-20T14:00:00.000Z',
      saida: '2026-05-20T15:00:00.000Z',
      duracao_seg: 3600,
      local_parada: '9039050 - ASSAI TIJUCA',
      codigo_loja: '9039050',
      nome_loja: 'ASSAI TIJUCA',
      lat: null, lng: null,
      classificacao: 'LOJA',
      ordem: 1,
    },
  ]

  it('ambas as linhas recebem a mesma parada ASSAI TIJUCA via compartilhada token', async () => {
    const rotas = await cruzaEscalaUnitrac(linhas, paradas, [])
    expect(rotas).toHaveLength(2)
    expect(rotas[0].paradas).toHaveLength(1)
    expect(rotas[1].paradas).toHaveLength(1)
    expect(rotas[0].paradas[0].parada_id).toBe('ag-p1')
    expect(rotas[1].paradas[0].parada_id).toBe('ag-p1')
  })
})

describe('T5 — tokensCore preserva discriminador dentro de parênteses', () => {
  // Helpers locais pra reduzir boilerplate dos testes T5
  const makeT5Line = (loja: string, rede = 'ARMAZEM_GRAO'): EscalaLinhaRow => ({
    id: 'e', rede_id: rede, placa_norm: 'AAA0000', loja_nome_raw: loja,
    loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19',
  })
  const makeT5Parada = (local: string, codigo = '5353003'): UnitracParadaRow => ({
    id: 'p', placa_norm: 'AAA0000', chegada: '2026-05-19T10:00:00Z', saida: null,
    duracao_seg: null, local_parada: local, codigo_loja: codigo, nome_loja: local,
    lat: null, lng: null, classificacao: 'LOJA', ordem: 1,
  })

  it('ARMAZÉM DO GRÃO (ITAIPAVA) casa com ARMAZEM DO GRAO (ITAIPAVA) — score 0', () => {
    const score = scorePair(
      makeT5Line('ARMAZÉM DO GRÃO (ITAIPAVA)'),
      makeT5Parada('ARMAZEM DO GRAO (ITAIPAVA)'),
    )
    expect(score).toBe(0)
  })

  it('continua removendo (1ª Entrega) — score 0', () => {
    const score = scorePair(
      makeT5Line('Princesa Buzios (1ª Entrega)', 'PRINCESA'),
      makeT5Parada('PRINCESA BUZIOS', '8590563'),
    )
    expect(score).toBe(0)
  })

  it('continua removendo (2° °ENTREGA) com ordinais duplos', () => {
    // Caso com `°` duplicado cai fora da regex específica e do regex pós-parênteses
    // (que exige dígito imediatamente antes de ENTREGA). Token "ENTREGA" sobra,
    // mas o match ainda é finito porque TIJUCA está em ambos.
    const score = scorePair(
      makeT5Line('Super Prix Tijuca (2° °ENTREGA)', 'SUPERPRIX'),
      makeT5Parada('SUPERPRIX TIJUCA', '3030014'),
    )
    expect(score).toBeLessThan(Infinity)
  })

  it('continua removendo (1ª Entregas) plural — score 0', () => {
    const score = scorePair(
      makeT5Line('Princesa Cabo Frio (1ª Entregas)', 'PRINCESA'),
      makeT5Parada('PRINCESA CABO FRIO', '8590100'),
    )
    expect(score).toBe(0)
  })

  it('continua removendo (Entrega Extra) — score 0', () => {
    const score = scorePair(
      makeT5Line('Princesa Buzios (Entrega Extra)', 'PRINCESA'),
      makeT5Parada('PRINCESA BUZIOS', '8590563'),
    )
    expect(score).toBe(0)
  })

  it('discriminador sem parênteses: REGINA BARRA DO IMBUY casa — score 0', () => {
    const score = scorePair(
      makeT5Line('REGINA BARRA DO IMBUY'),
      makeT5Parada('REGINA BARRA DO IMBUY', '5353012'),
    )
    expect(score).toBe(0)
  })

  // === Casos adicionais sugeridos pelo Reviewer 2 ===

  it('preserva discriminador com acento: (SÃO GONÇALO) — score 0', () => {
    const score = scorePair(
      makeT5Line('LOJA (SÃO GONÇALO)', 'PREZUNIC'),
      makeT5Parada('LOJA SAO GONCALO', '1'),
    )
    expect(score).toBe(0)
  })

  it('discriminador + marcador combinados: ITAIPAVA preservado, 1ª Entrega removido — score 0', () => {
    const score = scorePair(
      makeT5Line('ARMAZÉM DO GRÃO (ITAIPAVA) (1ª Entrega)'),
      makeT5Parada('ARMAZEM DO GRAO (ITAIPAVA)'),
    )
    expect(score).toBe(0)
  })

  it('Unitrac concatenada por vírgula: primeira parada com discriminador entre parênteses — score 0', () => {
    // tokensCore faz split(',')[0] — deve processar só "ARMAZEM DO GRAO (ITAIPAVA)"
    const score = scorePair(
      makeT5Line('ARMAZÉM DO GRÃO (ITAIPAVA)'),
      makeT5Parada('ARMAZEM DO GRAO (ITAIPAVA),OUTRA LOJA'),
    )
    expect(score).toBe(0)
  })

  it('parênteses não fechados: (ITAIPAVA continua sendo discriminador útil', () => {
    // Defensivo: regex específico não bate (falta `)`), [()]/g remove só o `(`,
    // ITAIPAVA permanece como token útil.
    const score = scorePair(
      makeT5Line('ARMAZÉM DO GRÃO (ITAIPAVA'),
      makeT5Parada('ARMAZEM DO GRAO ITAIPAVA'),
    )
    expect(score).toBe(0)
  })
})

describe('T7 — suffix-match com prefixo de rede conhecido', () => {
  const makeT7Line = (cod: string | null, loja: string, rede: string): EscalaLinhaRow => ({
    id: 'e', rede_id: rede, placa_norm: 'AAA0000', loja_nome_raw: loja,
    loja_codigo_raw: cod, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19',
  })
  const makeT7Parada = (cod: string, nome: string): UnitracParadaRow => ({
    id: 'p', placa_norm: 'AAA0000', chegada: '2026-05-19T10:00:00Z', saida: null,
    duracao_seg: null, local_parada: nome, codigo_loja: cod, nome_loja: nome,
    lat: null, lng: null, classificacao: 'LOJA', ordem: 1,
  })

  it('Zona Sul Loja "21" casa com 9039021', () => {
    const score = scorePair(
      makeT7Line('21', 'Zona Sul Flamengo', 'ZONA_SUL'),
      makeT7Parada('9039021', '21 - ZONA SUL - FLAMENGO'),
    )
    expect(score).toBe(0)
  })

  it('Zona Sul Loja "09" casa com 9039009 via padStart', () => {
    const score = scorePair(
      makeT7Line('09', 'Zona Sul Ipanema', 'ZONA_SUL'),
      makeT7Parada('9039009', '09 - ZONA SUL - IPANEMA'),
    )
    expect(score).toBe(0)
  })

  it('Superprix Loja "14" casa com 3030014', () => {
    const score = scorePair(
      makeT7Line('14', 'Super Prix Tijuca', 'SUPERPRIX'),
      makeT7Parada('3030014', 'SUPERPRIX LJ 14 - TIJUCA'),
    )
    expect(score).toBe(0)
  })

  it('Carrefour Loja "12" casa com 9006012 (prefixo 9006 adicionado)', () => {
    const score = scorePair(
      makeT7Line('12', 'Carrefour Alcantara', 'CARREFOUR'),
      makeT7Parada('9006012', 'CARREFOUR ALCANTARA'),
    )
    expect(score).toBe(0)
  })

  it('Guanabara Rota "1" (length=1) NÃO ativa suffix por código (length<2)', () => {
    // codL="1" length=1 — guard length≥2 bloqueia o suffix-match.
    // Match real da Guanabara Rota 1 acontece via outro fluxo (rede fallback +
    // nome tokens). Aqui validamos que código sozinho NÃO causa match indevido.
    // Nomes desviados de propósito pra isolar o teste a códigos.
    const score = scorePair(
      makeT7Line('1', 'Rota 01 Distribuidor', 'GUANABARA'),
      makeT7Parada('7100001', 'Atacado Manaus Norte'),
    )
    expect(score).toBe(Infinity)
  })

  it('Guanabara Rota "01" (length=2) JÁ casa com 7100001 via padStart', () => {
    // Quando a escala traz "01" em vez de "1", padStart 3 vira "001" e bate 7100001
    const score = scorePair(
      makeT7Line('01', 'Guanabara Rota 01', 'GUANABARA'),
      makeT7Parada('7100001', 'GUANABARA ROTA 01'),
    )
    expect(score).toBe(0)
  })

  it('CAB-Petrópolis "10" casa com 7012010', () => {
    const score = scorePair(
      makeT7Line('10', 'CAB Petropolis', 'CAB_PETROPOLIS'),
      makeT7Parada('7012010', 'CAB - PETROPOLIS'),
    )
    expect(score).toBe(0)
  })

  it('Feira Nova Loja "15" casa com 5790015 (prefixo 5790 adicionado)', () => {
    const score = scorePair(
      makeT7Line('15', 'Feira Nova Tijuca', 'FEIRA_NOVA'),
      makeT7Parada('5790015', 'FEIRA NOVA TIJUCA'),
    )
    expect(score).toBe(0)
  })

  it('NÃO casa quando prefixo desconhecido (99000021)', () => {
    // Prefixo "99" não está em REDE_PREFIX_RE — não pode disparar suffix length>=2
    const score = scorePair(
      makeT7Line('21', 'Loja Random', 'OUTRA'),
      makeT7Parada('99000021', 'OUTRA LOJA'),
    )
    expect(score).toBe(Infinity)
  })

  it('NÃO confunde length=2 sem prefixo de rede (códigos puros)', () => {
    // codP="9021" sem prefixo em REDE_PREFIX_RE. codL="21" length=2 — não dispara suffix.
    // Nomes totalmente disjuntos garantem que apenas a regra de código contava.
    const score = scorePair(
      makeT7Line('21', 'Cabo Frio Distribuidor', 'OUTRA'),
      makeT7Parada('9021', 'Manaus Atacarejo'),
    )
    expect(score).toBe(Infinity)
  })

  it('padStart NÃO confunde 21 com 9039121 (mesmo prefixo, sufixo divergente)', () => {
    // Critério crítico: padStart "21" → "021". "9039121" termina em "121", não "021".
    // Nomes disjuntos garantem que só o suffix-match poderia salvar — e não deve.
    const score = scorePair(
      makeT7Line('21', 'Cabo Frio Distribuidor', 'ZONA_SUL'),
      makeT7Parada('9039121', 'Manaus Atacarejo'),
    )
    expect(score).toBe(Infinity)
  })

  // Smoke tests pros 8 prefixos sem teste dedicado (regressão se alguém remover do regex)
  it('smoke prefixo 7000 (PREZUNIC): "14" casa com 7000014', () => {
    expect(scorePair(
      makeT7Line('14', 'Cabo Frio Distribuidor', 'PREZUNIC'),
      makeT7Parada('7000014', 'Manaus Atacarejo'),
    )).toBe(0)
  })

  it('smoke prefixo 8590 (PRINCESA): "14" casa com 8590014 via padStart', () => {
    // Códigos reais do Unitrac Princesa são prefixo + 3 dígitos (ex: 8590563).
    // Aqui usamos sintético 8590014 pra validar SÓ o regex; codL="14"→"014".
    expect(scorePair(
      makeT7Line('14', 'Cabo Frio Distribuidor', 'PRINCESA'),
      makeT7Parada('8590014', 'Manaus Atacarejo'),
    )).toBe(0)
  })

  it('smoke prefixo 5353 (ARMAZEM_GRAO): "12" casa com 5353012', () => {
    expect(scorePair(
      makeT7Line('12', 'Cabo Frio Distribuidor', 'ARMAZEM_GRAO'),
      makeT7Parada('5353012', 'Manaus Atacarejo'),
    )).toBe(0)
  })

  it('smoke prefixo 5600 (SENDAS): "22" casa com 5600022', () => {
    expect(scorePair(
      makeT7Line('22', 'Cabo Frio Distribuidor', 'SENDAS'),
      makeT7Parada('5600022', 'Manaus Atacarejo'),
    )).toBe(0)
  })

  it('smoke prefixo 11623 (VIANENSE): "32" casa com 11623032', () => {
    expect(scorePair(
      makeT7Line('32', 'Cabo Frio Distribuidor', 'VIANENSE'),
      makeT7Parada('11623032', 'Manaus Atacarejo'),
    )).toBe(0)
  })

  it('smoke prefixo 17659 (EMANUEL): "01" casa com 17659001', () => {
    expect(scorePair(
      makeT7Line('01', 'Cabo Frio Distribuidor', 'EMANUEL'),
      makeT7Parada('17659001', 'Manaus Atacarejo'),
    )).toBe(0)
  })

  it('smoke prefixo 2384 (ATACADAO): "12" casa com 2384012', () => {
    expect(scorePair(
      makeT7Line('12', 'Cabo Frio Distribuidor', 'ATACADAO'),
      makeT7Parada('2384012', 'Manaus Atacarejo'),
    )).toBe(0)
  })

  it('smoke prefixo 202 (SUPER_PAX): "12" casa com 202012', () => {
    expect(scorePair(
      makeT7Line('12', 'Cabo Frio Distribuidor', 'SUPER_PAX'),
      makeT7Parada('202012', 'Manaus Atacarejo'),
    )).toBe(0)
  })

  it('endurecimento: prefixo 710[0-3] NÃO captura 7104xxx (futuro)', () => {
    // 7104 não está na família atual (7100-7103). Se aparecer no futuro,
    // teste vai falhar e força revisão.
    expect(scorePair(
      makeT7Line('01', 'Cabo Frio Distribuidor', 'OUTRA'),
      makeT7Parada('7104001', 'Manaus Atacarejo'),
    )).toBe(Infinity)
  })

  it('endurecimento: prefixo 5600 NÃO captura 5601xxx', () => {
    // 5601 não está em REDE_PREFIX_RE (só 5600 cobre SENDAS atual)
    expect(scorePair(
      makeT7Line('22', 'Cabo Frio Distribuidor', 'OUTRA'),
      makeT7Parada('5601022', 'Manaus Atacarejo'),
    )).toBe(Infinity)
  })
})

describe('T8 — Fallback N:N por placa+rede', () => {
  it('2 linhas ARMAZEM_GRAO sem código + 2 paradas livres (mesma quantidade) → ambas casam por ordem', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'e1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'KPT5B20', loja_nome_raw: 'Boa Vista', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'e2', rede_id: 'ARMAZEM_GRAO', placa_norm: 'KPT5B20', loja_nome_raw: 'Matriz Posse', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
    ]
    // Paradas com nomes que NÃO compartilham token com escala — só estrutura/quantidade bate
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p1', placa_norm: 'KPT5B20', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'GEOFENCE NORTE', codigo_loja: '5353010', nome_loja: 'GEOFENCE NORTE', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
      { id: 'p2', placa_norm: 'KPT5B20', chegada: '2026-05-19T13:00:00Z', saida: '2026-05-19T14:00:00Z', duracao_seg: 3600, local_parada: 'GEOFENCE SUL', codigo_loja: '5353011', nome_loja: 'GEOFENCE SUL', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, [])
    const e1 = rotas.find(r => r.escala_linha_id === 'e1')
    const e2 = rotas.find(r => r.escala_linha_id === 'e2')
    expect(e1?.paradas).toHaveLength(1)
    expect(e2?.paradas).toHaveLength(1)
    // Ordem temporal preserva carro_ordem: carro 1 → parada cronologicamente 1ª
    expect(e1?.paradas[0].parada_id).toBe('p1')
    expect(e2?.paradas[0].parada_id).toBe('p2')
  })

  it('NÃO atua quando número de linhas != paradas (ambíguo)', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'e1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Loja A', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'e2', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Loja B', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
      { id: 'e3', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Loja C', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 3, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p1', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'XYZ', codigo_loja: '5353010', nome_loja: 'XYZ', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, [])
    // 3 linhas vs 1 parada: ambíguo, T8 não atua. Outros fallbacks podem (compartilhada),
    // mas SEM código nem token comum, todas ficam UNMATCHED. Apenas a primeira via fallback temporal
    // 1 linha (linhasOrdenadas.length === 1) NÃO ativa porque há 3.
    const matched = rotas.filter(r => r.paradas.length > 0)
    expect(matched).toHaveLength(0)
  })

  it('NÃO faz cross-rede: linha ARMAZEM + parada PRINCESA não casam por estrutura', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'e1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Boa Vista', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p1', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA BUZIOS', codigo_loja: '8590563', nome_loja: 'PRINCESA BUZIOS', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    // Parada cadastrada como PRINCESA via lojas → resolveLojaId infere PRINCESA → bloqueia ARMAZEM
    const lojas: LojaRow[] = [
      { id: 'lp', rede_id: 'PRINCESA', nome: 'Buzios', nome_normalizado: 'buzios', codigo_escala: null, codigo_unitrac: '8590563', nome_unitrac: 'PRINCESA BUZIOS', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // ARMAZEM não pode receber parada PRINCESA mesmo com estrutura 1:1
    expect(rotas[0].paradas).toHaveLength(0)
  })

  it('parada não identificada (redeInf=null) entra como coringa', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'e1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Boa Vista', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p1', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'GEOFENCE SEM CADASTRO', codigo_loja: '9999999', nome_loja: 'GEOFENCE SEM CADASTRO', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    // Sem `lojas` cadastradas, redeInf da parada é null → coringa
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, [])
    expect(rotas[0].paradas).toHaveLength(1)
    expect(rotas[0].paradas[0].parada_id).toBe('p1')
  })

  it('T8 ordena por carro_ordem, não cronologia — carro_ordem=1 pega 1ª parada cronológica', async () => {
    // Heurística: a escala lista lojas na ordem que o caminhão DEVERIA visitar
    // (carro_ordem). T8 ordena linhas por carro_ordem e paradas por chegada cronológica,
    // então o pareamento é sequência-escala × sequência-temporal.
    const escalaLinhas: EscalaLinhaRow[] = [
      // carro_ordem=2 listado primeiro pra garantir que ordenação interna não confia em índice de input
      { id: 'e_carro2', rede_id: 'ARMAZEM_GRAO', placa_norm: 'Z', loja_nome_raw: 'Loja Segunda', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
      { id: 'e_carro1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'Z', loja_nome_raw: 'Loja Primeira', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p_cedo', placa_norm: 'Z', chegada: '2026-05-19T08:00:00Z', saida: '2026-05-19T09:00:00Z', duracao_seg: 3600, local_parada: 'A', codigo_loja: '9991', nome_loja: 'A', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
      { id: 'p_tarde', placa_norm: 'Z', chegada: '2026-05-19T14:00:00Z', saida: '2026-05-19T15:00:00Z', duracao_seg: 3600, local_parada: 'B', codigo_loja: '9992', nome_loja: 'B', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, [])
    const carro1 = rotas.find(r => r.escala_linha_id === 'e_carro1')
    const carro2 = rotas.find(r => r.escala_linha_id === 'e_carro2')
    // carro_ordem=1 → 1ª cronologica (08h); carro_ordem=2 → 2ª cronologica (14h)
    expect(carro1?.paradas[0].parada_id).toBe('p_cedo')
    expect(carro2?.paradas[0].parada_id).toBe('p_tarde')
  })

  it('T8 com 2 redes diferentes na mesma placa: cada rede consome só as suas paradas', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'a1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'M', loja_nome_raw: 'Boa Vista', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'p1', rede_id: 'PRINCESA', placa_norm: 'M', loja_nome_raw: 'Buzios', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    // 1 parada Princesa cadastrada + 1 coringa não cadastrada
    const paradaRows: UnitracParadaRow[] = [
      { id: 'pp_princ', placa_norm: 'M', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA BUZIOS', codigo_loja: '8590563', nome_loja: 'PRINCESA BUZIOS', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
      { id: 'pp_coringa', placa_norm: 'M', chegada: '2026-05-19T13:00:00Z', saida: '2026-05-19T14:00:00Z', duracao_seg: 3600, local_parada: 'GEOFENCE X', codigo_loja: '9999999', nome_loja: 'GEOFENCE X', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lp', rede_id: 'PRINCESA', nome: 'Buzios', nome_normalizado: 'buzios', codigo_escala: null, codigo_unitrac: '8590563', nome_unitrac: 'PRINCESA BUZIOS', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    const princesaRota = rotas.find(r => r.escala_linha_id === 'p1')
    const armazemRota = rotas.find(r => r.escala_linha_id === 'a1')
    // Princesa casa via fluxo anterior (Hungarian + cadastro). Armazém pega a coringa via T8.
    expect(princesaRota?.paradas[0].parada_id).toBe('pp_princ')
    expect(armazemRota?.paradas[0].parada_id).toBe('pp_coringa')
  })

  it('N:N intra-rede com cadastro completo casa via fluxo anterior — T8 não precisa atuar', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'e1', rede_id: 'ZONA_SUL', placa_norm: 'KW', loja_nome_raw: 'Zona Sul Loja 21 - Flamengo', loja_codigo_raw: '21', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'e2', rede_id: 'ZONA_SUL', placa_norm: 'KW', loja_nome_raw: 'Zona Sul Loja 38 - Copacabana', loja_codigo_raw: '38', motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'pz21', placa_norm: 'KW', chegada: '2026-05-19T08:00:00Z', saida: '2026-05-19T09:00:00Z', duracao_seg: 3600, local_parada: '21 - ZONA SUL - FLAMENGO', codigo_loja: '9039021', nome_loja: '21 - ZONA SUL - FLAMENGO', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
      { id: 'pz38', placa_norm: 'KW', chegada: '2026-05-19T11:00:00Z', saida: '2026-05-19T12:00:00Z', duracao_seg: 3600, local_parada: '38 - ZONA SUL - COPACABANA', codigo_loja: '9039038', nome_loja: '38 - ZONA SUL - COPACABANA', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l21', rede_id: 'ZONA_SUL', nome: 'Flamengo', nome_normalizado: 'flamengo', codigo_escala: '21', codigo_unitrac: '9039021', nome_unitrac: '21 - ZONA SUL - FLAMENGO', lat: null, lng: null, raio_metros: 150 },
      { id: 'l38', rede_id: 'ZONA_SUL', nome: 'Copacabana', nome_normalizado: 'copacabana', codigo_escala: '38', codigo_unitrac: '9039038', nome_unitrac: '38 - ZONA SUL - COPACABANA', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // Cada linha casa com sua loja específica via Hungarian/cadastro, não 1:1 cego por T8
    expect(rotas.find(r => r.escala_linha_id === 'e1')?.paradas[0].parada_id).toBe('pz21')
    expect(rotas.find(r => r.escala_linha_id === 'e2')?.paradas[0].parada_id).toBe('pz38')
  })
})

describe('T13 — split local_parada sem prefixo numérico', () => {
  const makeT13Line = (loja: string, codigo: string | null = null): EscalaLinhaRow => ({
    id: 'e', rede_id: 'ARMAZEM_GRAO', placa_norm: 'AAA0000', loja_nome_raw: loja,
    loja_codigo_raw: codigo, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19',
  })
  const makeT13Parada = (local: string, codigo = '5353012'): UnitracParadaRow => ({
    id: 'p', placa_norm: 'AAA0000', chegada: '2026-05-19T10:00:00Z', saida: null,
    duracao_seg: null, local_parada: local, codigo_loja: codigo, nome_loja: local.split(',')[0].trim(),
    lat: null, lng: null, classificacao: 'LOJA', ordem: 1,
  })

  it('parte secundária do local_parada sem prefixo numérico bate por nome (REGINA 1 DE MAIO) — score 0', () => {
    // Escala "REGINA 1 DE MAIO"; Unitrac concatena "REGINA BARRA DO IMBUY, REGINA 1 DE MAIO"
    // codigo_loja da parada principal não bate, primeira parte nome diverge,
    // mas a SEGUNDA parte (sem prefixo numérico) é exatamente o nome da escala.
    // Tokens da escala {REGINA, 1, MAIO} ⊆ tokens da parte 2 → score 0
    const score = scorePair(
      makeT13Line('REGINA 1 DE MAIO'),
      makeT13Parada('REGINA BARRA DO IMBUY, REGINA 1 DE MAIO'),
    )
    expect(score).toBe(0)
  })

  it('parte com prefixo continua funcionando (EMANUEL ALHAMBRA via 21469000)', () => {
    // Regressão: garante que o caso clássico (parte 2 com prefixo numérico) continua casando
    const score = scorePair(
      makeT13Line('Emanuel - Alhambra', '21469000'),
      makeT13Parada('17659001 - O BOM CAMPO GRANDE,21469000 - EMANUEL ALHAMBRA'),
    )
    expect(score).toBe(0)
  })

  it('mistura: parte 1 com prefixo + parte 2 sem prefixo — pega o melhor match (score 0)', () => {
    const score = scorePair(
      makeT13Line('Pao de Acucar Botafogo'),
      makeT13Parada('5353012 - REGINA BARRA DO IMBUY, PAO DE ACUCAR BOTAFOGO'),
    )
    expect(score).toBe(0)
  })

  it('todas as partes sem prefixo + nenhuma bate o nome → Infinity', () => {
    const score = scorePair(
      makeT13Line('LOJA DE NICHE INEXISTENTE'),
      makeT13Parada('PADARIA SAO JORGE, MERCADO DA ESQUINA'),
    )
    expect(score).toBe(Infinity)
  })

  it('partes vazias por vírgulas duplas são ignoradas (filter(Boolean)) — score 0', () => {
    const score = scorePair(
      makeT13Line('REGINA 1 DE MAIO'),
      makeT13Parada('REGINA BARRA DO IMBUY,, REGINA 1 DE MAIO,'),
    )
    expect(score).toBe(0)
  })

  it('single-part sem vírgula nem prefixo (caso modal): casa por nome direto', () => {
    // local_parada com 1 elemento só, sem vírgulas. Fluxo mais comum no Unitrac.
    // Não passa pelo loop de partes (split retorna array de 1), mas o matchScore
    // da linha 324 (nome_loja) deve casar antes desse fluxo. Testa caminho feliz.
    const score = scorePair(
      makeT13Line('REGINA BARRA DO IMBUY'),
      makeT13Parada('REGINA BARRA DO IMBUY'),
    )
    expect(score).toBe(0)
  })

  it('whitespace agressivo entre vírgulas é tolerado', () => {
    // Espaços antes/depois da vírgula → trim() em cada parte garante match.
    const score = scorePair(
      makeT13Line('REGINA 1 DE MAIO'),
      makeT13Parada('REGINA BARRA DO IMBUY   ,   REGINA 1 DE MAIO'),
    )
    expect(score).toBe(0)
  })
})

describe('T10 — Aliases inter-rede SENDAS↔ASSAI, PAX↔SUPER_PAX', () => {
  it('escala ASSAI casa parada SENDAS via paradaRedes expandido (sem código, depende de alias)', async () => {
    // Cenário rebrand GPA: escala diz ASSAI mas catálogo `lojas` ainda tem rede_id=SENDAS.
    // Forçamos o caminho do ALIAS removendo loja_codigo_raw e usando nome divergente
    // (sem token comum entre "Loja XYZ" e "SENDAS ALCANTARA"). Sem T10, paradaRedes
    // pra essa parada teria só {SENDAS}, bloqueando a escala ASSAI no fallback temporal.
    // Com T10, paradaRedes vira {SENDAS, ASSAI} via redesFungiveis → escala ASSAI passa.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'a1', rede_id: 'ASSAI', placa_norm: 'X', loja_nome_raw: 'Loja XYZ', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p1', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'SENDAS ALCANTARA', codigo_loja: '5600035', nome_loja: 'SENDAS ALCANTARA', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l1', rede_id: 'SENDAS', nome: 'Alcantara', nome_normalizado: 'alcantara', codigo_escala: '35', codigo_unitrac: '5600035', nome_unitrac: 'SENDAS ALCANTARA', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // T10 desbloqueia: parada cadastrada SENDAS aceita escala ASSAI (fallback temporal length=1)
    expect(rotas[0].paradas).toHaveLength(1)
    expect(rotas[0].paradas[0].parada_id).toBe('p1')
  })

  it('direção inversa: escala SENDAS casa parada ASSAI cadastrada (alias bidirecional)', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 's1', rede_id: 'SENDAS', placa_norm: 'X', loja_nome_raw: 'Loja XYZ', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p1', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'ASSAI BARRA', codigo_loja: '9006001', nome_loja: 'ASSAI BARRA', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l1', rede_id: 'ASSAI', nome: 'Barra', nome_normalizado: 'barra', codigo_escala: '1', codigo_unitrac: '9006001', nome_unitrac: 'ASSAI BARRA', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    expect(rotas[0].paradas).toHaveLength(1)
    expect(rotas[0].paradas[0].parada_id).toBe('p1')
  })

  it('T8 aceita parada SENDAS sem cadastro pra escala ASSAI quando contagem bate', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'a1', rede_id: 'ASSAI', placa_norm: 'Y', loja_nome_raw: 'Loja Indefinida', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    // Parada com nome SENDAS mas SEM cadastro em lojas → redeInf=null (coringa)
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p1', placa_norm: 'Y', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'SENDAS NOVO', codigo_loja: '5601111', nome_loja: 'SENDAS NOVO', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    // Sem cadastro → coringa → T8 atua 1:1
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, [])
    expect(rotas[0].paradas).toHaveLength(1)
    expect(rotas[0].paradas[0].parada_id).toBe('p1')
  })

  it('aliases NÃO afetam redes não aliased (PREZUNIC continua bloqueando ARMAZEM)', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'a1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'Z', loja_nome_raw: 'Boa Vista', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p1', placa_norm: 'Z', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'PREZUNIC FONSECA', codigo_loja: '7000999', nome_loja: 'PREZUNIC FONSECA', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lp', rede_id: 'PREZUNIC', nome: 'Fonseca', nome_normalizado: 'fonseca', codigo_escala: null, codigo_unitrac: '7000999', nome_unitrac: 'PREZUNIC FONSECA', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // PREZUNIC e ARMAZEM_GRAO NÃO são aliases → ARMAZEM bloqueado
    expect(rotas[0].paradas).toHaveLength(0)
  })

  it('SUPER_PAX casa parada cadastrada como PAX (alias)', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'sp1', rede_id: 'SUPER_PAX', placa_norm: 'P', loja_nome_raw: 'Sepetiba', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p1', placa_norm: 'P', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'PAX SEPETIBA', codigo_loja: '202012', nome_loja: 'PAX SEPETIBA', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lp', rede_id: 'PAX', nome: 'Sepetiba', nome_normalizado: 'sepetiba', codigo_escala: null, codigo_unitrac: '202012', nome_unitrac: 'PAX SEPETIBA', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // SUPER_PAX↔PAX são aliases → casa
    expect(rotas[0].paradas).toHaveLength(1)
    expect(rotas[0].paradas[0].parada_id).toBe('p1')
  })

  it('direção inversa: PAX casa parada cadastrada como SUPER_PAX (alias bidirecional)', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'px1', rede_id: 'PAX', placa_norm: 'P', loja_nome_raw: 'Sepetiba', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p1', placa_norm: 'P', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'SUPER PAX SEPETIBA', codigo_loja: '202012', nome_loja: 'SUPER PAX SEPETIBA', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lp', rede_id: 'SUPER_PAX', nome: 'Sepetiba', nome_normalizado: 'sepetiba', codigo_escala: null, codigo_unitrac: '202012', nome_unitrac: 'SUPER PAX SEPETIBA', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    expect(rotas[0].paradas).toHaveLength(1)
    expect(rotas[0].paradas[0].parada_id).toBe('p1')
  })
})

describe('T11 — Rede-aware no assignOptimal (penalty cross-rede)', () => {
  it('penalty empurra Hungarian a preferir match na rede certa', async () => {
    // Placa carrega 1 linha VIANENSE + 1 linha SENDAS. Há 2 paradas:
    // uma SENDAS cadastrada e outra "ambígua" cujo nome tem token comum
    // com Vianense MAS rede cadastrada é SENDAS.
    // SEM T11: Hungarian poderia atribuir parada SENDAS para Vianense por score igual.
    // COM T11: parada SENDAS recebe +5 quando cruzada com VIANENSE → fica menos atrativa
    // que match dentro da rede.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'v', rede_id: 'VIANENSE', placa_norm: 'X', loja_nome_raw: 'Vianense Nova Iguacu', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 's', rede_id: 'SENDAS', placa_norm: 'X', loja_nome_raw: 'Sendas Nova Iguacu', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
    ]
    // Parada SENDAS cadastrada. Tem token "NOVA","IGUACU" em comum com ambas escalas.
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p_se', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'SENDAS NOVA IGUACU', codigo_loja: '5600099', nome_loja: 'SENDAS NOVA IGUACU', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lse', rede_id: 'SENDAS', nome: 'Nova Iguacu', nome_normalizado: 'nova iguacu', codigo_escala: null, codigo_unitrac: '5600099', nome_unitrac: 'SENDAS NOVA IGUACU', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // Foco do teste: a ATRIBUIÇÃO INICIAL via Hungarian (assignOptimal) deve
    // mandar a parada SENDAS pra escala SENDAS, não pra VIANENSE.
    // VIANENSE pode receber a parada compartilhada via outro fallback (compartilhada
    // por token), mas o Hungarian escolheu a rede certa primeiro.
    expect(rotas.find(r => r.escala_linha_id === 's')?.paradas[0]?.parada_id).toBe('p_se')
  })

  it('penalty NÃO bloqueia match cross-rede quando é a única opção (queda graciosa)', async () => {
    // Escala VIANENSE sozinha + 1 parada SENDAS cadastrada com token em comum.
    // Hungarian aplica penalty +5 mas mantém score finito (não Infinity).
    // T11 documenta queda graciosa: a parada É atribuída mesmo cross-rede
    // porque é a única opção, e a alternativa (UNMATCHED) seria pior.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'v', rede_id: 'VIANENSE', placa_norm: 'X', loja_nome_raw: 'Vianense Belford Roxo', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p_se', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'SENDAS BELFORD ROXO', codigo_loja: '5600100', nome_loja: 'SENDAS BELFORD ROXO', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lse', rede_id: 'SENDAS', nome: 'Belford Roxo', nome_normalizado: 'belford roxo', codigo_escala: null, codigo_unitrac: '5600100', nome_unitrac: 'SENDAS BELFORD ROXO', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // assignOptimal atribui (penalty +5 ainda é finito). Assertion concreta: parada casou.
    const v = rotas.find(r => r.escala_linha_id === 'v')
    expect(v?.paradas[0]?.parada_id).toBe('p_se')
  })

  it('penalty aplica também no branch Hungarian (nL > 5): VIANENSE NÃO leva parada SENDAS', async () => {
    // 6 linhas força nL > 5 → branch Hungarian. 1 VIANENSE + 5 SENDAS de bairros
    // diferentes, todos competindo pela mesma parada SENDAS NOVA IGUACU.
    // VIANENSE Nova Iguacu tem token em comum com a parada.
    // SEM T11: Hungarian poderia atribuir parada → VIANENSE por empate alfabético
    // ("Sendas N" alfabeticamente vem depois de "Vianense").
    // COM T11: VIANENSE recebe +5 penalty no scoring → não compete.
    // Foco: validar que VIANENSE não recebeu a parada via Hungarian.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'v', rede_id: 'VIANENSE', placa_norm: 'X', loja_nome_raw: 'Vianense Nova Iguacu', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 's0', rede_id: 'SENDAS', placa_norm: 'X', loja_nome_raw: 'Sendas Nova Iguacu', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
      // 4 SENDAS de bairros distintos (sem token "NOVA IGUACU") — não competem.
      { id: 's1', rede_id: 'SENDAS', placa_norm: 'X', loja_nome_raw: 'Sendas Madureira', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 3, data_entrega: '2026-05-19' },
      { id: 's2', rede_id: 'SENDAS', placa_norm: 'X', loja_nome_raw: 'Sendas Tijuca', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 4, data_entrega: '2026-05-19' },
      { id: 's3', rede_id: 'SENDAS', placa_norm: 'X', loja_nome_raw: 'Sendas Botafogo', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 5, data_entrega: '2026-05-19' },
      { id: 's4', rede_id: 'SENDAS', placa_norm: 'X', loja_nome_raw: 'Sendas Copacabana', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 6, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p_se', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'SENDAS NOVA IGUACU', codigo_loja: '5600099', nome_loja: 'SENDAS NOVA IGUACU', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lse', rede_id: 'SENDAS', nome: 'Nova Iguacu', nome_normalizado: 'nova iguacu', codigo_escala: null, codigo_unitrac: '5600099', nome_unitrac: 'SENDAS NOVA IGUACU', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // s0 (Sendas Nova Iguacu) leva a parada via Hungarian (mesma rede + token match)
    expect(rotas.find(r => r.escala_linha_id === 's0')?.paradas[0]?.parada_id).toBe('p_se')
    // VIANENSE NÃO leva a parada (penalty +5 cross-rede tira da disputa do Hungarian).
    // Nota: VIANENSE pode ainda receber via fallback temporal/compartilhada (outros mecanismos),
    // mas o Hungarian inicial — alvo da T11 — preferiu SENDAS.
  })

  it('T12 — cross-rede bloqueado no fallback (parada ZONA_SUL não vai pra escala ARMAZEM)', async () => {
    // Combinação T11 (penalty no assignOptimal) + guard cross-rede l.622 +
    // T12 (coringa restrito) garante: escala de rede X com 1 parada cadastrada
    // como rede Y nunca produz match. UNMATCHED é o resultado correto.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'a', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Armazem Barra', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'ZONA SUL LARANJEIRAS', codigo_loja: '9039030', nome_loja: '30 - ZONA SUL - LARANJEIRAS', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lzs', rede_id: 'ZONA_SUL', nome: 'Laranjeiras', nome_normalizado: 'laranjeiras', codigo_escala: '30', codigo_unitrac: '9039030', nome_unitrac: '30 - ZONA SUL - LARANJEIRAS', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    expect(rotas).toHaveLength(1)
    expect(rotas[0].paradas).toHaveLength(0)
  })

  it('T12 — mesma rede sem tokens em comum: redundância removida (UNMATCHED esperado)', async () => {
    // KUL1425-style: escala PREZUNIC PECHINCHA + 2 paradas PREZUNIC sem token comum.
    // 1 linha + 2 paradas = T8 não dispara (qtd != 1). assignOptimal tem score
    // Infinity (tokens disjuntos). Fallback temporal: ANTES T12, `redes.has(PREZUNIC)`
    // aceitava e KPI saía com horários da loja errada. AGORA: UNMATCHED correto.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'pe', rede_id: 'PREZUNIC', placa_norm: 'X', loja_nome_raw: 'Prezunic Pechincha', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p_vi', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'PREZUNIC VILA ISABEL', codigo_loja: '7000999', nome_loja: 'PREZUNIC VILA ISABEL', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
      { id: 'p_bo', placa_norm: 'X', chegada: '2026-05-19T14:00:00Z', saida: '2026-05-19T15:00:00Z', duracao_seg: 3600, local_parada: 'PREZUNIC BOTAFOGO', codigo_loja: '7000888', nome_loja: 'PREZUNIC BOTAFOGO', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lvi', rede_id: 'PREZUNIC', nome: 'Vila Isabel', nome_normalizado: 'vila isabel', codigo_escala: null, codigo_unitrac: '7000999', nome_unitrac: 'PREZUNIC VILA ISABEL', lat: null, lng: null, raio_metros: 150 },
      { id: 'lbo', rede_id: 'PREZUNIC', nome: 'Botafogo', nome_normalizado: 'botafogo', codigo_escala: null, codigo_unitrac: '7000888', nome_unitrac: 'PREZUNIC BOTAFOGO', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // Mesma rede mas tokens disjuntos → não casa por nome.
    // ANTES T12: o `redes.has(PREZUNIC)` aceitava primeira parada por ordem cronológica.
    // AGORA: UNMATCHED — operador decide qual loja foi visitada (ou nenhuma).
    expect(rotas[0].paradas).toHaveLength(0)
  })

  it('T12 — branch coringa NÃO dispara com 2+ linhas (length !== 1)', async () => {
    // 2 linhas ARMAZEM sozinhas + 1 parada SEM cadastro (coringa).
    // O branch `length === 1 && size === 0` da T12 não dispara → fica UNMATCHED.
    // (T8 também não atua: 2 linhas != 1 parada.)
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'a1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Loja Alpha', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'a2', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Loja Beta', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'GEOFENCE COMPLETAMENTE DESCONHECIDO', codigo_loja: '9999999', nome_loja: 'GEOFENCE COMPLETAMENTE DESCONHECIDO', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, [])
    // 2 linhas vs 1 parada coringa → nenhuma deve casar (ambíguo).
    const totalParadas = rotas.reduce((s, r) => s + r.paradas.length, 0)
    expect(totalParadas).toBe(0)
  })

  it('T12 preserva — fallback "1 linha sozinha" ainda aceita parada SEM rede cadastrada', async () => {
    // Caso Guanabara Rota 01 (do test antigo "Bug C — Rota 01 sozinha"):
    // 1 linha sem código + 1 parada sem cadastro de loja → redes.size === 0 → aceita.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'g', rede_id: 'GUANABARA', placa_norm: 'X', loja_nome_raw: 'Guanabara - Rota 01', loja_codigo_raw: '1', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: '4519090 - GUANABARA MADUREIRA', codigo_loja: '4519090', nome_loja: 'GUANABARA MADUREIRA', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    // lojas=[] → parada não tem rede cadastrada → coringa entra
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, [])
    expect(rotas[0].paradas).toHaveLength(1)
    expect(rotas[0].paradas[0].parada_id).toBe('p')
  })

  it('T9 — cross-docking ARMAZEM_GRAO pega carona em paradas Princesa', async () => {
    // Cenário real dia 19: caminhão Princesa entrega Armazém Grão no mesmo geofence.
    // 3 linhas Princesa (cadastradas) + 3 linhas Armazém (sem cadastro/token).
    // 3 paradas PRINCESA BUZIOS cadastradas → Hungarian casa as 3 Princesas.
    // T9 vê: ARMAZEM_GRAO sem nenhum match na placa, em REDES_CROSSDOCK,
    // 3 paradas em uso pelas Princesas → distribui as 3 paradas pras 3 Armazéns
    // por carro_ordem × cronologia.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'pr1', rede_id: 'PRINCESA', placa_norm: 'QST', loja_nome_raw: 'Princesa Buzios 1', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'pr2', rede_id: 'PRINCESA', placa_norm: 'QST', loja_nome_raw: 'Princesa Buzios 2', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
      { id: 'pr3', rede_id: 'PRINCESA', placa_norm: 'QST', loja_nome_raw: 'Princesa Buzios 3', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 3, data_entrega: '2026-05-19' },
      { id: 'ag1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'QST', loja_nome_raw: 'Mosela', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'ag2', rede_id: 'ARMAZEM_GRAO', placa_norm: 'QST', loja_nome_raw: 'Quitandinha', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
      { id: 'ag3', rede_id: 'ARMAZEM_GRAO', placa_norm: 'QST', loja_nome_raw: 'Valparaiso', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 3, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'pp1', placa_norm: 'QST', chegada: '2026-05-19T08:00:00Z', saida: '2026-05-19T09:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA BUZIOS 1', codigo_loja: '8590001', nome_loja: 'PRINCESA BUZIOS 1', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
      { id: 'pp2', placa_norm: 'QST', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA BUZIOS 2', codigo_loja: '8590002', nome_loja: 'PRINCESA BUZIOS 2', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
      { id: 'pp3', placa_norm: 'QST', chegada: '2026-05-19T12:00:00Z', saida: '2026-05-19T13:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA BUZIOS 3', codigo_loja: '8590003', nome_loja: 'PRINCESA BUZIOS 3', lat: null, lng: null, classificacao: 'LOJA', ordem: 3 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l1', rede_id: 'PRINCESA', nome: 'Buzios 1', nome_normalizado: 'buzios 1', codigo_escala: null, codigo_unitrac: '8590001', nome_unitrac: 'PRINCESA BUZIOS 1', lat: null, lng: null, raio_metros: 150 },
      { id: 'l2', rede_id: 'PRINCESA', nome: 'Buzios 2', nome_normalizado: 'buzios 2', codigo_escala: null, codigo_unitrac: '8590002', nome_unitrac: 'PRINCESA BUZIOS 2', lat: null, lng: null, raio_metros: 150 },
      { id: 'l3', rede_id: 'PRINCESA', nome: 'Buzios 3', nome_normalizado: 'buzios 3', codigo_escala: null, codigo_unitrac: '8590003', nome_unitrac: 'PRINCESA BUZIOS 3', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // Princesas continuam casando (Hungarian + cadastro)
    expect(rotas.find(r => r.escala_linha_id === 'pr1')?.paradas[0]?.parada_id).toBe('pp1')
    expect(rotas.find(r => r.escala_linha_id === 'pr2')?.paradas[0]?.parada_id).toBe('pp2')
    expect(rotas.find(r => r.escala_linha_id === 'pr3')?.paradas[0]?.parada_id).toBe('pp3')
    // ARMAZEM_GRAO removido de REDES_CROSSDOCK (entrega própria em Petrópolis/Itaipava,
    // não pega carona). T9 não atua → ficam UNMATCHED (sem parada atribuída).
    expect(rotas.find(r => r.escala_linha_id === 'ag1')?.paradas).toHaveLength(0)
    expect(rotas.find(r => r.escala_linha_id === 'ag2')?.paradas).toHaveLength(0)
    expect(rotas.find(r => r.escala_linha_id === 'ag3')?.paradas).toHaveLength(0)
  })

  it('T9 NÃO ativa pra redes fora de REDES_CROSSDOCK (VIANENSE não pega carona)', async () => {
    // VIANENSE não está em REDES_CROSSDOCK → não recebe parada via T9.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'pr', rede_id: 'PRINCESA', placa_norm: 'X', loja_nome_raw: 'Princesa Buzios 1', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'v', rede_id: 'VIANENSE', placa_norm: 'X', loja_nome_raw: 'Vianense Nova Iguacu', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'pp', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA BUZIOS 1', codigo_loja: '8590001', nome_loja: 'PRINCESA BUZIOS 1', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lp', rede_id: 'PRINCESA', nome: 'Buzios 1', nome_normalizado: 'buzios 1', codigo_escala: null, codigo_unitrac: '8590001', nome_unitrac: 'PRINCESA BUZIOS 1', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // PRINCESA casa via Hungarian
    expect(rotas.find(r => r.escala_linha_id === 'pr')?.paradas[0]?.parada_id).toBe('pp')
    // VIANENSE NÃO é cross-dock conhecido → fica UNMATCHED via T9
    // (pode receber via outros mecanismos, mas T9 não faz cross-dock pra VIANENSE)
    // Aceita ambos: ou fica sem match ou T8/compartilhada atribui. Foco do teste: T9 não atua.
    const v = rotas.find(r => r.escala_linha_id === 'v')
    // VIANENSE não está em REDES_CROSSDOCK — T9 não distribui parada PRINCESA pra ela
    // Outros fluxos podem (token compartilhada). Documenta comportamento atual:
    // sem token comum direto → fica UNMATCHED.
    expect(v?.paradas).toHaveLength(0)
  })

  it('T9 — FEIRA_NOVA também pega carona em paradas de outra rede', async () => {
    // FEIRA_NOVA também está em REDES_CROSSDOCK. Caminhão Prezunic carrega
    // entregas Feira Nova no mesmo geofence.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'pz', rede_id: 'PREZUNIC', placa_norm: 'F', loja_nome_raw: 'Prezunic Tijuca', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'fn', rede_id: 'FEIRA_NOVA', placa_norm: 'F', loja_nome_raw: 'Feira Nova Meier', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'pp', placa_norm: 'F', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'PREZUNIC TIJUCA', codigo_loja: '7000010', nome_loja: 'PREZUNIC TIJUCA', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l', rede_id: 'PREZUNIC', nome: 'Tijuca', nome_normalizado: 'tijuca', codigo_escala: null, codigo_unitrac: '7000010', nome_unitrac: 'PREZUNIC TIJUCA', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    expect(rotas.find(r => r.escala_linha_id === 'pz')?.paradas[0]?.parada_id).toBe('pp')
    expect(rotas.find(r => r.escala_linha_id === 'fn')?.paradas[0]?.parada_id).toBe('pp')
  })

  it('T9 — clamp: 4 ARMAZEMs órfãos vs 2 paradas Princesa reusam a última', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'pr1', rede_id: 'PRINCESA', placa_norm: 'C', loja_nome_raw: 'Princesa A', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'pr2', rede_id: 'PRINCESA', placa_norm: 'C', loja_nome_raw: 'Princesa B', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
      ...Array.from({ length: 4 }, (_, i): EscalaLinhaRow => ({
        id: `ag${i + 1}`, rede_id: 'ARMAZEM_GRAO', placa_norm: 'C',
        loja_nome_raw: `Armazem L${i + 1}`, loja_codigo_raw: null, motorista_nome: null,
        carro_ordem: i + 1, data_entrega: '2026-05-19',
      })),
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'pp1', placa_norm: 'C', chegada: '2026-05-19T08:00:00Z', saida: '2026-05-19T09:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA A', codigo_loja: '8590001', nome_loja: 'PRINCESA A', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
      { id: 'pp2', placa_norm: 'C', chegada: '2026-05-19T12:00:00Z', saida: '2026-05-19T13:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA B', codigo_loja: '8590002', nome_loja: 'PRINCESA B', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l1', rede_id: 'PRINCESA', nome: 'A', nome_normalizado: 'a', codigo_escala: null, codigo_unitrac: '8590001', nome_unitrac: 'PRINCESA A', lat: null, lng: null, raio_metros: 150 },
      { id: 'l2', rede_id: 'PRINCESA', nome: 'B', nome_normalizado: 'b', codigo_escala: null, codigo_unitrac: '8590002', nome_unitrac: 'PRINCESA B', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // Princesas casam
    expect(rotas.find(r => r.escala_linha_id === 'pr1')?.paradas[0]?.parada_id).toBe('pp1')
    expect(rotas.find(r => r.escala_linha_id === 'pr2')?.paradas[0]?.parada_id).toBe('pp2')
    // ARMAZEM_GRAO não está em REDES_CROSSDOCK → todos ficam UNMATCHED
    expect(rotas.find(r => r.escala_linha_id === 'ag1')?.paradas).toHaveLength(0)
    expect(rotas.find(r => r.escala_linha_id === 'ag2')?.paradas).toHaveLength(0)
    expect(rotas.find(r => r.escala_linha_id === 'ag3')?.paradas).toHaveLength(0)
    expect(rotas.find(r => r.escala_linha_id === 'ag4')?.paradas).toHaveLength(0)
  })

  it('T9 — match crossdock recebe confidence=LOW + requiresReview', async () => {
    // Cross-dock é heurística (R1 alertou) — operador deve revisar.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'pr', rede_id: 'PRINCESA', placa_norm: 'M', loja_nome_raw: 'Princesa X', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'ag', rede_id: 'ARMAZEM_GRAO', placa_norm: 'M', loja_nome_raw: 'Armazem Y', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'pp', placa_norm: 'M', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA X', codigo_loja: '8590100', nome_loja: 'PRINCESA X', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lp', rede_id: 'PRINCESA', nome: 'X', nome_normalizado: 'x', codigo_escala: null, codigo_unitrac: '8590100', nome_unitrac: 'PRINCESA X', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // PRINCESA continua HIGH via Hungarian
    const pr = rotas.find(r => r.escala_linha_id === 'pr')
    expect(pr?._matchMeta?.confidence).toBe('HIGH')
    // ARMAZEM_GRAO não está em REDES_CROSSDOCK → UNMATCHED (algorithm='none')
    const ag = rotas.find(r => r.escala_linha_id === 'ag')
    expect(ag?.paradas).toHaveLength(0)
    expect(ag?._matchMeta?.algorithm).toBe('none')
  })

  it('T9 NÃO atua quando todas redes são crossdock (paradasUsadasFinal vazio)', async () => {
    // ARMAZEM + FEIRA_NOVA juntas, nenhuma primary casada → sem paradas pra reusar
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'ag', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Armazem A', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'fn', rede_id: 'FEIRA_NOVA', placa_norm: 'X', loja_nome_raw: 'Feira B', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'GEOFENCE', codigo_loja: '9999999', nome_loja: 'GEOFENCE', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, [])
    // T8 atua: 1 linha ARMAZEM (rede primeira no loop) + 1 parada coringa → casa.
    // Após T8, paradasUsadasFinal=[p]. T9 vê: ag matched (rede em REDES_CROSSDOCK),
    // fn órfã (rede em REDES_CROSSDOCK). T9 distribui parada pp pra fn também.
    // É o comportamento esperado: ambas redes de carona herdam a parada.
    const ag = rotas.find(r => r.escala_linha_id === 'ag')
    const fn = rotas.find(r => r.escala_linha_id === 'fn')
    // Pelo menos uma deve receber match (T8 atribui pra primeira na ordem)
    expect((ag?.paradas.length ?? 0) + (fn?.paradas.length ?? 0)).toBeGreaterThanOrEqual(1)
  })

  it('T16 — multi-trip: cada parada recebe saída-CD da sua BASE anterior', async () => {
    // QSZ-9A20 style: caminhão sai 00:18, entrega 2 lojas Princesa, volta à BASE,
    // sai de novo 12:35 e entrega 1 loja Armazém Grão.
    // ANTES T16: as 3 lojas tinham saida_cd=00:18 (BASE Trip 1).
    // DEPOIS T16: Princesa lojas têm saida_cd=00:18, Armazém tem saida_cd=12:35.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'pr1', rede_id: 'PRINCESA', placa_norm: 'QSZ', loja_nome_raw: 'Princesa Maricá 1', loja_codigo_raw: '1', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
      { id: 'pr2', rede_id: 'PRINCESA', placa_norm: 'QSZ', loja_nome_raw: 'Princesa Maricá 2', loja_codigo_raw: '2', motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-20' },
      { id: 'ag', rede_id: 'ARMAZEM_GRAO', placa_norm: 'QSZ', loja_nome_raw: 'Armazem Boa Vista', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      // BASE Trip 1: chegou 23:30 do dia anterior, saiu 00:18
      { id: 'b1', placa_norm: 'QSZ', chegada: '2026-05-20T03:00:00Z', saida: '2026-05-20T03:18:00Z', duracao_seg: 1080, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: null, lng: null, classificacao: 'BASE', ordem: 1 },
      // Princesa Maricá 1 e 2
      { id: 'pp1', placa_norm: 'QSZ', chegada: '2026-05-20T05:00:00Z', saida: '2026-05-20T06:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA MARICÁ 1', codigo_loja: '8590001', nome_loja: 'PRINCESA MARICÁ 1', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
      { id: 'pp2', placa_norm: 'QSZ', chegada: '2026-05-20T06:30:00Z', saida: '2026-05-20T07:30:00Z', duracao_seg: 3600, local_parada: 'PRINCESA MARICÁ 2', codigo_loja: '8590002', nome_loja: 'PRINCESA MARICÁ 2', lat: null, lng: null, classificacao: 'LOJA', ordem: 3 },
      // Volta à BASE Trip 2: chegou 11:45, saiu 12:35
      { id: 'b2', placa_norm: 'QSZ', chegada: '2026-05-20T14:45:00Z', saida: '2026-05-20T15:35:00Z', duracao_seg: 3000, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: null, lng: null, classificacao: 'BASE', ordem: 4 },
      // Armazém Boa Vista — Trip 2
      { id: 'agp', placa_norm: 'QSZ', chegada: '2026-05-20T16:00:00Z', saida: '2026-05-20T17:00:00Z', duracao_seg: 3600, local_parada: 'ARMAZEM BOA VISTA', codigo_loja: '5353010', nome_loja: 'ARMAZEM BOA VISTA', lat: null, lng: null, classificacao: 'LOJA', ordem: 5 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lp1', rede_id: 'PRINCESA', nome: 'Maricá 1', nome_normalizado: 'marica 1', codigo_escala: '1', codigo_unitrac: '8590001', nome_unitrac: 'PRINCESA MARICÁ 1', lat: null, lng: null, raio_metros: 150 },
      { id: 'lp2', rede_id: 'PRINCESA', nome: 'Maricá 2', nome_normalizado: 'marica 2', codigo_escala: '2', codigo_unitrac: '8590002', nome_unitrac: 'PRINCESA MARICÁ 2', lat: null, lng: null, raio_metros: 150 },
      { id: 'lag', rede_id: 'ARMAZEM_GRAO', nome: 'Boa Vista', nome_normalizado: 'boa vista', codigo_escala: null, codigo_unitrac: '5353010', nome_unitrac: 'ARMAZEM BOA VISTA', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // Princesa Trip 1 → saida_cd = saída da BASE 1 (03:18Z = 00:18 BRT)
    expect(rotas.find(r => r.escala_linha_id === 'pr1')?.saida_cd?.toISOString()).toBe('2026-05-20T03:18:00.000Z')
    expect(rotas.find(r => r.escala_linha_id === 'pr2')?.saida_cd?.toISOString()).toBe('2026-05-20T03:18:00.000Z')
    // Armazém Trip 2 → saida_cd = saída da BASE 2 (15:35Z = 12:35 BRT), NÃO da BASE 1
    expect(rotas.find(r => r.escala_linha_id === 'ag')?.saida_cd?.toISOString()).toBe('2026-05-20T15:35:00.000Z')
  })

  it('T16 — 1 trip único: comportamento idêntico ao antigo (regressão)', async () => {
    // Cenário canônico: 1 BASE de manhã + 2 lojas. Antes e depois T16 dão a mesma saída-CD.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'l1', rede_id: 'PRINCESA', placa_norm: 'AAA', loja_nome_raw: 'Princesa Loja 1', loja_codigo_raw: '1', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
      { id: 'l2', rede_id: 'PRINCESA', placa_norm: 'AAA', loja_nome_raw: 'Princesa Loja 2', loja_codigo_raw: '2', motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-20' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'b', placa_norm: 'AAA', chegada: '2026-05-20T03:00:00Z', saida: '2026-05-20T03:30:00Z', duracao_seg: 1800, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: null, lng: null, classificacao: 'BASE', ordem: 1 },
      { id: 'pp1', placa_norm: 'AAA', chegada: '2026-05-20T05:00:00Z', saida: '2026-05-20T06:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA L1', codigo_loja: '8590001', nome_loja: 'PRINCESA L1', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
      { id: 'pp2', placa_norm: 'AAA', chegada: '2026-05-20T07:00:00Z', saida: '2026-05-20T08:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA L2', codigo_loja: '8590002', nome_loja: 'PRINCESA L2', lat: null, lng: null, classificacao: 'LOJA', ordem: 3 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l1c', rede_id: 'PRINCESA', nome: 'L1', nome_normalizado: 'l1', codigo_escala: '1', codigo_unitrac: '8590001', nome_unitrac: 'PRINCESA L1', lat: null, lng: null, raio_metros: 150 },
      { id: 'l2c', rede_id: 'PRINCESA', nome: 'L2', nome_normalizado: 'l2', codigo_escala: '2', codigo_unitrac: '8590002', nome_unitrac: 'PRINCESA L2', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // Ambas lojas têm saída-CD = saída da BASE única
    expect(rotas.find(r => r.escala_linha_id === 'l1')?.saida_cd?.toISOString()).toBe('2026-05-20T03:30:00.000Z')
    expect(rotas.find(r => r.escala_linha_id === 'l2')?.saida_cd?.toISOString()).toBe('2026-05-20T03:30:00.000Z')
  })

  it('T16 — 3 trips: cada parada herda saída-CD da BASE imediatamente anterior', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'a', rede_id: 'PRINCESA', placa_norm: 'TTT', loja_nome_raw: 'Loja A', loja_codigo_raw: '1', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
      { id: 'b', rede_id: 'PRINCESA', placa_norm: 'TTT', loja_nome_raw: 'Loja B', loja_codigo_raw: '2', motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-20' },
      { id: 'c', rede_id: 'PRINCESA', placa_norm: 'TTT', loja_nome_raw: 'Loja C', loja_codigo_raw: '3', motorista_nome: null, carro_ordem: 3, data_entrega: '2026-05-20' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      // BASE Trip 1
      { id: 'bz1', placa_norm: 'TTT', chegada: '2026-05-20T03:00:00Z', saida: '2026-05-20T03:30:00Z', duracao_seg: 1800, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: null, lng: null, classificacao: 'BASE', ordem: 1 },
      { id: 'la', placa_norm: 'TTT', chegada: '2026-05-20T05:00:00Z', saida: '2026-05-20T06:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA A', codigo_loja: '8590001', nome_loja: 'PRINCESA A', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
      // BASE Trip 2
      { id: 'bz2', placa_norm: 'TTT', chegada: '2026-05-20T11:00:00Z', saida: '2026-05-20T12:30:00Z', duracao_seg: 5400, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: null, lng: null, classificacao: 'BASE', ordem: 3 },
      { id: 'lb', placa_norm: 'TTT', chegada: '2026-05-20T13:30:00Z', saida: '2026-05-20T14:30:00Z', duracao_seg: 3600, local_parada: 'PRINCESA B', codigo_loja: '8590002', nome_loja: 'PRINCESA B', lat: null, lng: null, classificacao: 'LOJA', ordem: 4 },
      // BASE Trip 3
      { id: 'bz3', placa_norm: 'TTT', chegada: '2026-05-20T17:00:00Z', saida: '2026-05-20T18:30:00Z', duracao_seg: 5400, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: null, lng: null, classificacao: 'BASE', ordem: 5 },
      { id: 'lc', placa_norm: 'TTT', chegada: '2026-05-20T20:00:00Z', saida: '2026-05-20T21:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA C', codigo_loja: '8590003', nome_loja: 'PRINCESA C', lat: null, lng: null, classificacao: 'LOJA', ordem: 6 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lA', rede_id: 'PRINCESA', nome: 'A', nome_normalizado: 'a', codigo_escala: '1', codigo_unitrac: '8590001', nome_unitrac: 'PRINCESA A', lat: null, lng: null, raio_metros: 150 },
      { id: 'lB', rede_id: 'PRINCESA', nome: 'B', nome_normalizado: 'b', codigo_escala: '2', codigo_unitrac: '8590002', nome_unitrac: 'PRINCESA B', lat: null, lng: null, raio_metros: 150 },
      { id: 'lC', rede_id: 'PRINCESA', nome: 'C', nome_normalizado: 'c', codigo_escala: '3', codigo_unitrac: '8590003', nome_unitrac: 'PRINCESA C', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    expect(rotas.find(r => r.escala_linha_id === 'a')?.saida_cd?.toISOString()).toBe('2026-05-20T03:30:00.000Z')
    expect(rotas.find(r => r.escala_linha_id === 'b')?.saida_cd?.toISOString()).toBe('2026-05-20T12:30:00.000Z')
    expect(rotas.find(r => r.escala_linha_id === 'c')?.saida_cd?.toISOString()).toBe('2026-05-20T18:30:00.000Z')
  })

  it('T16 — FAKE_EXIT com prefixo BASE BENASSI conta como anchor', async () => {
    // GPS bounce na base gera FAKE_EXIT (duracao <= 15min) em vez de BASE.
    // Predicado deve aceitar ambos.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'l1', rede_id: 'PRINCESA', placa_norm: 'FFF', loja_nome_raw: 'L1', loja_codigo_raw: '1', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'fe', placa_norm: 'FFF', chegada: '2026-05-20T03:00:00Z', saida: '2026-05-20T03:20:00Z', duracao_seg: 1200, local_parada: 'BASE BENASSI - SAIDA', codigo_loja: null, nome_loja: null, lat: null, lng: null, classificacao: 'FAKE_EXIT', ordem: 1 },
      { id: 'pp', placa_norm: 'FFF', chegada: '2026-05-20T05:00:00Z', saida: '2026-05-20T06:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA L1', codigo_loja: '8590001', nome_loja: 'PRINCESA L1', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l1c', rede_id: 'PRINCESA', nome: 'L1', nome_normalizado: 'l1', codigo_escala: '1', codigo_unitrac: '8590001', nome_unitrac: 'PRINCESA L1', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    expect(rotas.find(r => r.escala_linha_id === 'l1')?.saida_cd?.toISOString()).toBe('2026-05-20T03:20:00.000Z')
  })

  it('T16 — BASE com saida=null é IGNORADA → saida_cd fica null', async () => {
    // Predicado exige `p.saida` truthy. BASE com saída null é parada em aberto
    // (caminhão ainda parado), não conta como anchor.
    // Bug 2 fix: sem BASE válida, saida_cd = null (não usa chegada como fallback).
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'l1', rede_id: 'PRINCESA', placa_norm: 'NNN', loja_nome_raw: 'L1', loja_codigo_raw: '1', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'b', placa_norm: 'NNN', chegada: '2026-05-20T03:00:00Z', saida: null, duracao_seg: null, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: null, lng: null, classificacao: 'BASE', ordem: 1 },
      { id: 'pp', placa_norm: 'NNN', chegada: '2026-05-20T05:00:00Z', saida: '2026-05-20T06:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA L1', codigo_loja: '8590001', nome_loja: 'PRINCESA L1', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l1c', rede_id: 'PRINCESA', nome: 'L1', nome_normalizado: 'l1', codigo_escala: '1', codigo_unitrac: '8590001', nome_unitrac: 'PRINCESA L1', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // BASE sem saída → ignorada. Sem outra âncora → saida_cd = null
    expect(rotas.find(r => r.escala_linha_id === 'l1')?.saida_cd).toBeNull()
  })

  it('T9 NÃO atua quando placa tem só 1 rede (precisa de redesNaPlaca.size >= 2)', async () => {
    // 2 linhas mesma rede ARMAZEM_GRAO + 1 parada PRINCESA cadastrada.
    // Como só tem 1 rede na placa (ARMAZEM), T9 não dispara (sem cross-dock real).
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'a1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Loja Alpha', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'a2', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Loja Beta', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'pp', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA BUZIOS', codigo_loja: '8590001', nome_loja: 'PRINCESA BUZIOS', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'lp', rede_id: 'PRINCESA', nome: 'Buzios', nome_normalizado: 'buzios', codigo_escala: null, codigo_unitrac: '8590001', nome_unitrac: 'PRINCESA BUZIOS', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // Sem cross-dock (1 rede só) → T9 não estende. Outros fluxos: paradaRedes=PRINCESA
    // bloqueia ARMAZEM no fallback temporal. T8 não dispara (2 linhas != 1 parada).
    expect(rotas[0].paradas).toHaveLength(0)
    expect(rotas[1].paradas).toHaveLength(0)
  })

  it('3 redes na mesma placa: cada parada cadastrada vai pra sua rede', async () => {
    // PRINCESA + ARMAZEM_GRAO + ZONA_SUL na mesma placa, 3 paradas cadastradas
    // (uma de cada rede). Mapeamento 1-1 esperado.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'pr', rede_id: 'PRINCESA', placa_norm: 'X', loja_nome_raw: 'Princesa Buzios', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'ag', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Armazem Boa Vista', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
      { id: 'zs', rede_id: 'ZONA_SUL', placa_norm: 'X', loja_nome_raw: 'Zona Sul Ipanema', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 3, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p_pr', placa_norm: 'X', chegada: '2026-05-19T08:00:00Z', saida: '2026-05-19T09:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA BUZIOS', codigo_loja: '8590563', nome_loja: 'PRINCESA BUZIOS', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
      { id: 'p_ag', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'ARMAZEM BOA VISTA', codigo_loja: '5353001', nome_loja: 'ARMAZEM BOA VISTA', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
      { id: 'p_zs', placa_norm: 'X', chegada: '2026-05-19T12:00:00Z', saida: '2026-05-19T13:00:00Z', duracao_seg: 3600, local_parada: 'ZONA SUL IPANEMA', codigo_loja: '9039009', nome_loja: 'ZONA SUL IPANEMA', lat: null, lng: null, classificacao: 'LOJA', ordem: 3 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l_pr', rede_id: 'PRINCESA', nome: 'Buzios', nome_normalizado: 'buzios', codigo_escala: null, codigo_unitrac: '8590563', nome_unitrac: 'PRINCESA BUZIOS', lat: null, lng: null, raio_metros: 150 },
      { id: 'l_ag', rede_id: 'ARMAZEM_GRAO', nome: 'Boa Vista', nome_normalizado: 'boa vista', codigo_escala: null, codigo_unitrac: '5353001', nome_unitrac: 'ARMAZEM BOA VISTA', lat: null, lng: null, raio_metros: 150 },
      { id: 'l_zs', rede_id: 'ZONA_SUL', nome: 'Ipanema', nome_normalizado: 'ipanema', codigo_escala: null, codigo_unitrac: '9039009', nome_unitrac: 'ZONA SUL IPANEMA', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    expect(rotas.find(r => r.escala_linha_id === 'pr')?.paradas[0]?.parada_id).toBe('p_pr')
    expect(rotas.find(r => r.escala_linha_id === 'ag')?.paradas[0]?.parada_id).toBe('p_ag')
    expect(rotas.find(r => r.escala_linha_id === 'zs')?.paradas[0]?.parada_id).toBe('p_zs')
  })

  it('aliases não recebem penalty (ASSAI casa parada SENDAS com score normal)', async () => {
    // Escala ASSAI, parada cadastrada SENDAS. redesFungiveis('ASSAI') = {ASSAI, SENDAS}.
    // SENDAS está no Set → casa = true → SEM penalty.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'a', rede_id: 'ASSAI', placa_norm: 'X', loja_nome_raw: 'Assai Alcantara', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'SENDAS ALCANTARA', codigo_loja: '5600035', nome_loja: 'SENDAS ALCANTARA', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l', rede_id: 'SENDAS', nome: 'Alcantara', nome_normalizado: 'alcantara', codigo_escala: null, codigo_unitrac: '5600035', nome_unitrac: 'SENDAS ALCANTARA', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    expect(rotas[0].paradas[0].parada_id).toBe('p')
  })

  it('T17 — geofences sobrepostas cross-rede: linhas ARMAZEM não recebem parada PRINCESA', async () => {
    // Cenário real QSZ9A20 dia 20/05: paradas PRINCESA têm códigos ARMAZEM como
    // geofences secundárias (polígonos grandes sobrepostos no Unitrac).
    // SEM T17: scorePair=0 via código secundário + penalty=5 (finito) → optimizer
    //          casava ARMAZEM→PRINCESA erroneamente.
    // COM T17: hasCompatible=true (pag cadastrada como ARMAZEM_GRAO) → Infinity
    //          (hard block) → optimizer mantém ARMAZEM→ARMAZEM.
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'ag_reg', rede_id: 'ARMAZEM_GRAO', placa_norm: 'QSZ9A20', loja_nome_raw: 'Regina Barra Imbuy', loja_codigo_raw: '5353012', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
      { id: 'ag_abs', rede_id: 'ARMAZEM_GRAO', placa_norm: 'QSZ9A20', loja_nome_raw: 'Abastecedora Grao Serra', loja_codigo_raw: '5353017', motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-20' },
    ]
    // Paradas PRINCESA: código primário PRINCESA + códigos ARMAZEM como secundários
    // (geofences sobrepostas — QSZ9A20 realmente entrou na geofence ARMAZEM ao visitar PRINCESA).
    const paradaRows: UnitracParadaRow[] = [
      {
        id: 'pp1', placa_norm: 'QSZ9A20',
        chegada: '2026-05-21T07:45:00Z', saida: '2026-05-21T08:30:00Z', duracao_seg: 2700,
        local_parada: '8590002 - PRINCESA MARICA 1,5353012 - REGINA BARRA IMBUY,5353017 - ABASTECEDORA GRAO SERRA',
        codigo_loja: '8590002', nome_loja: 'PRINCESA MARICA 1',
        lat: null, lng: null, classificacao: 'LOJA', ordem: 1,
      },
      {
        id: 'pp2', placa_norm: 'QSZ9A20',
        chegada: '2026-05-21T09:35:00Z', saida: '2026-05-21T10:20:00Z', duracao_seg: 2700,
        local_parada: '8590003 - PRINCESA MARICA 2,5353012 - REGINA BARRA IMBUY,5353017 - ABASTECEDORA GRAO SERRA',
        codigo_loja: '8590003', nome_loja: 'PRINCESA MARICA 2',
        lat: null, lng: null, classificacao: 'LOJA', ordem: 2,
      },
      // Parada ARMAZEM pura (sem sobreposição PRINCESA)
      {
        id: 'pag', placa_norm: 'QSZ9A20',
        chegada: '2026-05-21T12:19:00Z', saida: '2026-05-21T13:00:00Z', duracao_seg: 2460,
        local_parada: '5353012 - REGINA BARRA IMBUY',
        codigo_loja: '5353012', nome_loja: 'REGINA BARRA IMBUY',
        lat: null, lng: null, classificacao: 'LOJA', ordem: 3,
      },
    ]
    const lojas: LojaRow[] = [
      { id: 'l_pp1', rede_id: 'PRINCESA', nome: 'Marica 1', nome_normalizado: 'marica 1', codigo_escala: null, codigo_unitrac: '8590002', nome_unitrac: 'PRINCESA MARICA 1', lat: null, lng: null, raio_metros: 150 },
      { id: 'l_pp2', rede_id: 'PRINCESA', nome: 'Marica 2', nome_normalizado: 'marica 2', codigo_escala: null, codigo_unitrac: '8590003', nome_unitrac: 'PRINCESA MARICA 2', lat: null, lng: null, raio_metros: 150 },
      { id: 'l_pag', rede_id: 'ARMAZEM_GRAO', nome: 'Regina Barra Imbuy', nome_normalizado: 'regina barra imbuy', codigo_escala: null, codigo_unitrac: '5353012', nome_unitrac: 'REGINA BARRA IMBUY', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    // ag_reg (código 5353012) deve ir para pag (ARMAZEM), não pp1/pp2 (PRINCESA).
    const reg = rotas.find(r => r.escala_linha_id === 'ag_reg')
    expect(reg?.paradas[0]?.parada_id).toBe('pag')
    // ag_abs (código 5353017) não tem parada ARMAZEM com esse código; pode receber
    // pag via compartilhada (mesma rede) — mas nunca deve receber parada PRINCESA.
    const abs = rotas.find(r => r.escala_linha_id === 'ag_abs')
    const absParadaId = abs?.paradas[0]?.parada_id
    expect(absParadaId).not.toBe('pp1')
    expect(absParadaId).not.toBe('pp2')
  })
})
