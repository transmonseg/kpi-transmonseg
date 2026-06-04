import { describe, it, expect } from 'vitest'
import { detectaAnomalias } from './anomalia'
import type { RotaKpi, ParadaKpi } from '@/lib/types/kpi'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParada(overrides: Partial<ParadaKpi> = {}): ParadaKpi {
  const chegada = new Date('2026-05-18T09:00:00.000Z')
  const saida = new Date('2026-05-18T09:30:00.000Z')
  return {
    parada_id: 'p1',
    loja_id: 'loja-1',
    nome: 'Loja Teste',
    chegada,
    saida,
    duracao_min: 30,
    classificacao: 'LOJA',
    ...overrides,
  }
}

function makeRota(overrides: Partial<RotaKpi> = {}): RotaKpi {
  return {
    escala_linha_id: 'escala-1',
    data: '2026-05-18',
    rede_id: 'ZONA_SUL',
    placa_norm: 'ABC1234',
    saida_cd: new Date('2026-05-18T09:00:00.000Z'),
    paradas: [makeParada()],
    anomalias_codigos: [],
    status: 'ok',
    ...overrides,
  }
}

function makeEscalaLinha(overrides: Partial<{
  id: string
  placa_norm: string | null
  rede_id: string
  data_entrega: string
  loja_nome_raw: string
}> = {}) {
  return {
    id: 'escala-1',
    placa_norm: 'ABC1234',
    rede_id: 'ZONA_SUL',
    data_entrega: '2026-05-18',
    loja_nome_raw: 'Zona Sul Barra',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// ANOM-01: placa na escala mas sem GPS
// ---------------------------------------------------------------------------

describe('ANOM-01: placa na escala sem dados GPS', () => {
  it('dispara quando placa tem escala mas paradasIndex não tem a placa e paradas está vazio e status != sem_entrega', () => {
    const rota = makeRota({ paradas: [], status: 'ok' })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map(), // placa ausente do GPS
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    const anom = result.filter((a) => a.codigo === 'ANOM-01')
    expect(anom).toHaveLength(1)
    expect(anom[0].severidade).toBe('HIGH')
    expect(anom[0].payload).toMatchObject({ placa: 'ABC1234' })
  })

  it('dispara com tem_gps:true quando placa tem GPS mas paradas=[] (UNMATCHED)', () => {
    const rota = makeRota({ paradas: [], status: 'ok' })
    // paradasIndex TEM a placa (GPS existe) mas rota.paradas está vazio (matcher falhou)
    const paradasIndex = new Map<string, []>([['ABC1234', []]])
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex,
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    const anom = result.filter((a) => a.codigo === 'ANOM-01')
    expect(anom).toHaveLength(1)
    expect(anom[0].severidade).toBe('HIGH')
    expect(anom[0].payload).toMatchObject({ tem_gps: true })
  })

  it('NÃO dispara quando rota tem status sem_entrega', () => {
    const rota = makeRota({ paradas: [], status: 'sem_entrega' })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map(),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-01')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// ANOM-02: placa no GPS mas sem escala
// ---------------------------------------------------------------------------

describe('ANOM-02: placa no GPS sem linha de escala', () => {
  it('dispara quando paradasIndex tem placa que não está em escalaLinhas', () => {
    const paradasIndex = new Map([
      ['XYZ9999', []],
    ])
    const result = detectaAnomalias({
      rotas: [],
      escalaLinhas: [], // escala vazia
      paradasIndex,
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    const anom = result.filter((a) => a.codigo === 'ANOM-02')
    expect(anom).toHaveLength(1)
    expect(anom[0].severidade).toBe('LOW')
    expect(anom[0].payload).toMatchObject({ placa: 'XYZ9999' })
  })

  it('NÃO dispara quando placa do GPS está na escala', () => {
    const paradasIndex = new Map([['ABC1234', []]])
    const result = detectaAnomalias({
      rotas: [],
      escalaLinhas: [makeEscalaLinha({ placa_norm: 'ABC1234' })],
      paradasIndex,
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-02')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// ANOM-03: FORA_BASE com duração >= 10min e sem loja_id
// ---------------------------------------------------------------------------

describe('ANOM-03: parada FORA_BASE longa sem loja', () => {
  it('dispara para parada FORA_BASE com 10 min e sem loja_id', () => {
    const parada = makeParada({ classificacao: 'FORA_BASE', duracao_min: 10, loja_id: null })
    const rota = makeRota({ paradas: [parada] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    const anom = result.filter((a) => a.codigo === 'ANOM-03')
    expect(anom).toHaveLength(1)
    expect(anom[0].severidade).toBe('MEDIUM')
  })

  it('NÃO dispara para FORA_BASE com 9 min', () => {
    const parada = makeParada({ classificacao: 'FORA_BASE', duracao_min: 9, loja_id: null })
    const rota = makeRota({ paradas: [parada] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-03')).toHaveLength(0)
  })

  it('NÃO dispara para FORA_BASE com loja_id preenchido', () => {
    const parada = makeParada({ classificacao: 'FORA_BASE', duracao_min: 15, loja_id: 'loja-x' })
    const rota = makeRota({ paradas: [parada] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-03')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// ANOM-06: saida_cd ausente mas paradas existem
// ---------------------------------------------------------------------------

describe('ANOM-06: saida_cd ausente com paradas registradas', () => {
  it('dispara quando saida_cd é null mas há paradas', () => {
    const rota = makeRota({ saida_cd: null, paradas: [makeParada()] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    const anom = result.filter((a) => a.codigo === 'ANOM-06')
    expect(anom).toHaveLength(1)
    expect(anom[0].severidade).toBe('HIGH')
  })

  it('NÃO dispara quando saida_cd está preenchida', () => {
    const rota = makeRota({ saida_cd: new Date('2026-05-18T06:00:00.000Z'), paradas: [makeParada()] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-06')).toHaveLength(0)
  })

  it('NÃO dispara quando não há paradas (mesmo com saida_cd null)', () => {
    const rota = makeRota({ saida_cd: null, paradas: [] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map(),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-06')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// ANOM-11: saída do CD fora da janela operacional da rede
// ---------------------------------------------------------------------------

describe('ANOM-11: saída do CD fora da janela', () => {
  // Parsers do Unitrac armazenam BRT como Date.UTC(...) — ver gerador-kpi.ts:23.
  // BRT 04:00 → new Date('2026-05-18T04:00:00.000Z')  (getUTCHours()=4)
  // BRT 10:00 → new Date('2026-05-18T10:00:00.000Z')  (getUTCHours()=10)

  const janelaNormal = new Map([
    ['ZONA_SUL', { janela_inicio: '06:00', janela_fim: '18:00' }],
  ])

  it('dispara quando saída BRT 04:00 está FORA da janela 06:00-18:00', () => {
    const rota = makeRota({
      rede_id: 'ZONA_SUL',
      saida_cd: new Date('2026-05-18T04:00:00.000Z'),
    })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: janelaNormal,
      data: '2026-05-18',
    })
    const anom = result.filter((a) => a.codigo === 'ANOM-11')
    expect(anom).toHaveLength(1)
    expect(anom[0].severidade).toBe('LOW')
  })

  it('NÃO dispara quando saída BRT 10:00 está DENTRO da janela 06:00-18:00', () => {
    const rota = makeRota({
      rede_id: 'ZONA_SUL',
      saida_cd: new Date('2026-05-18T10:00:00.000Z'),
    })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: janelaNormal,
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-11')).toHaveLength(0)
  })

  // Janela wrap-around 22:00–06:00 (vira meia-noite)
  // BRT mascarado como UTC: 23:00 → Date.UTC(...,23,0); 10:00 → Date.UTC(...,10,0)

  const janelaWrap = new Map([
    ['ATACADAO', { janela_inicio: '22:00', janela_fim: '06:00' }],
  ])

  it('janela wrap-around: BRT 23:00 está DENTRO da janela 22:00-06:00 → não dispara', () => {
    const rota = makeRota({
      rede_id: 'ATACADAO',
      saida_cd: new Date('2026-05-18T23:00:00.000Z'),
      paradas: [makeParada()],
    })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha({ rede_id: 'ATACADAO' })],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: janelaWrap,
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-11')).toHaveLength(0)
  })

  it('janela wrap-around: BRT 10:00 está FORA da janela 22:00-06:00 → dispara', () => {
    const rota = makeRota({
      rede_id: 'ATACADAO',
      saida_cd: new Date('2026-05-18T10:00:00.000Z'),
      paradas: [makeParada()],
    })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha({ rede_id: 'ATACADAO' })],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: janelaWrap,
      data: '2026-05-18',
    })
    const anom = result.filter((a) => a.codigo === 'ANOM-11')
    expect(anom).toHaveLength(1)
  })

  it('NÃO dispara quando rede não tem janela cadastrada', () => {
    const rota = makeRota({
      rede_id: 'GUANABARA',
      saida_cd: new Date('2026-05-18T03:00:00.000Z'), // BRT 00:00 - possivelmente fora de qualquer janela
    })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha({ rede_id: 'GUANABARA' })],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(), // sem janela para GUANABARA
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-11')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// ANOM-05: divergência de qtd de paradas na escala
// ---------------------------------------------------------------------------

describe('ANOM-05: qtd paradas divergente da escala', () => {
  it('NÃO dispara quando parada matched é FORA_BASE (geo-match) em rota single-loja', () => {
    // Regressão: antes contava só 'LOJA', então FORA_BASE geo-match disparava ANOM-05 falso.
    const parada = makeParada({ classificacao: 'FORA_BASE', loja_id: 'geo-1' })
    const rota = makeRota({ paradas: [parada] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha({ loja_nome_raw: 'Zona Sul Barra' })],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-05')).toHaveLength(0)
  })

  it('NÃO dispara quando parada matched é LOJA em rota single-loja', () => {
    const rota = makeRota({ paradas: [makeParada({ classificacao: 'LOJA' })] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha({ loja_nome_raw: 'Zona Sul Barra' })],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-05')).toHaveLength(0)
  })

  it('NÃO dispara para rota multi-loja (separador / ou E)', () => {
    const rota = makeRota({ paradas: [] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha({ loja_nome_raw: 'Loja A / Loja B' })],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-05')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// ANOM-04 (HIGH) e ANOM-12 (MEDIUM): parada com tempo inválido ou duração zero
// ---------------------------------------------------------------------------

describe('ANOM-04 / ANOM-12: parada com tempo inválido ou sem saída', () => {
  it('dispara ANOM-12 (MEDIUM) quando saida === chegada e duracao_min === 0', () => {
    const chegada = new Date('2026-05-18T10:00:00.000Z')
    const parada = makeParada({
      chegada,
      saida: chegada, // mesmo timestamp
      duracao_min: 0,
    })
    const rota = makeRota({ paradas: [parada] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    const anom12 = result.filter((a) => a.codigo === 'ANOM-12')
    expect(anom12).toHaveLength(1)
    expect(anom12[0].severidade).toBe('MEDIUM')
    // ANOM-04 não deve disparar (saida não é < chegada)
    expect(result.filter((a) => a.codigo === 'ANOM-04')).toHaveLength(0)
  })

  it('NÃO dispara ANOM-04 nem ANOM-12 quando saida > chegada (duração normal)', () => {
    const chegada = new Date('2026-05-18T10:00:00.000Z')
    const saida = new Date('2026-05-18T10:30:00.000Z')
    const parada = makeParada({
      chegada,
      saida,
      duracao_min: 30,
    })
    const rota = makeRota({ paradas: [parada] })
    const result = detectaAnomalias({
      rotas: [rota],
      escalaLinhas: [makeEscalaLinha()],
      paradasIndex: new Map([['ABC1234', []]]),
      janelasRede: new Map(),
      data: '2026-05-18',
    })
    expect(result.filter((a) => a.codigo === 'ANOM-04')).toHaveLength(0)
    expect(result.filter((a) => a.codigo === 'ANOM-12')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// ANOM-13: entrega geograficamente implausível (>2km da loja)
// ---------------------------------------------------------------------------
describe('ANOM-13: entrega longe da loja', () => {
  const baseArgs = { escalaLinhas: [makeEscalaLinha()], janelasRede: new Map(), data: '2026-05-18' }
  function paradasIdxGps(lat: number, lng: number) {
    return new Map([['ABC1234', [{ id: 'p1', classificacao: 'LOJA', chegada: new Date('2026-05-18T09:00:00Z'), saida: new Date('2026-05-18T09:30:00Z'), duracao_seg: 1800, lat, lng }]]])
  }
  it('dispara quando a parada está a >2km da loja cadastrada', () => {
    const rota = makeRota({ paradas: [makeParada({ parada_id: 'p1', loja_id: 'loja-1' })] })
    const r = detectaAnomalias({ ...baseArgs, rotas: [rota], paradasIndex: paradasIdxGps(-22.90, -43.50), lojaCoords: new Map([['loja-1', { lat: -22.90, lng: -43.20, raio_metros: 150 }]]) })
    expect(r.some(a => a.codigo === 'ANOM-13')).toBe(true)
  })
  it('NÃO dispara quando a parada está perto (<2km)', () => {
    const rota = makeRota({ paradas: [makeParada({ parada_id: 'p1', loja_id: 'loja-1' })] })
    const r = detectaAnomalias({ ...baseArgs, rotas: [rota], paradasIndex: paradasIdxGps(-22.9005, -43.2005), lojaCoords: new Map([['loja-1', { lat: -22.90, lng: -43.20, raio_metros: 150 }]]) })
    expect(r.some(a => a.codigo === 'ANOM-13')).toBe(false)
  })
  it('NÃO dispara quando a loja está em 0,0 (coord inválida)', () => {
    const rota = makeRota({ paradas: [makeParada({ parada_id: 'p1', loja_id: 'loja-1' })] })
    const r = detectaAnomalias({ ...baseArgs, rotas: [rota], paradasIndex: paradasIdxGps(-22.90, -43.50), lojaCoords: new Map([['loja-1', { lat: 0, lng: 0, raio_metros: 150 }]]) })
    expect(r.some(a => a.codigo === 'ANOM-13')).toBe(false)
  })
  it('NÃO dispara sem lojaCoords (retrocompatível)', () => {
    const rota = makeRota({ paradas: [makeParada({ parada_id: 'p1', loja_id: 'loja-1' })] })
    const r = detectaAnomalias({ ...baseArgs, rotas: [rota], paradasIndex: paradasIdxGps(-22.90, -43.50) })
    expect(r.some(a => a.codigo === 'ANOM-13')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ANOM-14: mesma placa em 2 lugares ao mesmo tempo (super-contagem)
// ---------------------------------------------------------------------------
describe('ANOM-14: sobreposição temporal', () => {
  const baseArgs = { escalaLinhas: [makeEscalaLinha({ id: 'e1' }), makeEscalaLinha({ id: 'e2' })], paradasIndex: new Map(), janelasRede: new Map(), data: '2026-05-18' }
  it('dispara quando a mesma placa entrega em 2 lojas com horários sobrepostos', () => {
    const r1 = makeRota({ escala_linha_id: 'e1', paradas: [makeParada({ parada_id: 'pa', loja_id: 'lA', nome: 'Loja A', chegada: new Date('2026-05-18T09:00:00Z'), saida: new Date('2026-05-18T10:00:00Z') })] })
    const r2 = makeRota({ escala_linha_id: 'e2', paradas: [makeParada({ parada_id: 'pb', loja_id: 'lB', nome: 'Loja B', chegada: new Date('2026-05-18T09:30:00Z'), saida: new Date('2026-05-18T10:30:00Z') })] })
    const r = detectaAnomalias({ ...baseArgs, rotas: [r1, r2] })
    expect(r.some(a => a.codigo === 'ANOM-14')).toBe(true)
  })
  it('NÃO dispara quando as entregas não se sobrepõem', () => {
    const r1 = makeRota({ escala_linha_id: 'e1', paradas: [makeParada({ parada_id: 'pa', loja_id: 'lA', nome: 'Loja A', chegada: new Date('2026-05-18T09:00:00Z'), saida: new Date('2026-05-18T09:30:00Z') })] })
    const r2 = makeRota({ escala_linha_id: 'e2', paradas: [makeParada({ parada_id: 'pb', loja_id: 'lB', nome: 'Loja B', chegada: new Date('2026-05-18T10:00:00Z'), saida: new Date('2026-05-18T10:30:00Z') })] })
    const r = detectaAnomalias({ ...baseArgs, rotas: [r1, r2] })
    expect(r.some(a => a.codigo === 'ANOM-14')).toBe(false)
  })
})
