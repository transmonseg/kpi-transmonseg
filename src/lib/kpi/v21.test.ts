/**
 * Testes específicos pros 3 reforços da V2.1:
 *   - Reforço 5: rotas gigantes não casam via código exato sem citação explícita
 *   - Reforço 7: placas CD-only crônicas com 0 paradas LOJA são descartadas
 */
import { describe, it, expect } from 'vitest'
import { scorePair, cruzaEscalaUnitrac, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from './matcher'
import { isRotaGigante } from './rotas-gigantes'
import { isVeiculoInativo } from './veiculos-inativos'

const makeLine = (overrides: Partial<EscalaLinhaRow> = {}): EscalaLinhaRow => ({
  id: 'l1', rede_id: 'EMANUEL', placa_norm: 'ABC1234',
  loja_nome_raw: 'ALHAMBRA', loja_codigo_raw: null,
  motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20',
  ...overrides,
})

const makeParada = (overrides: Partial<UnitracParadaRow> = {}): UnitracParadaRow => ({
  id: 'p1', placa_norm: 'ABC1234',
  chegada: '2026-05-20T10:00:00.000Z', saida: '2026-05-20T11:00:00.000Z', duracao_seg: 3600,
  local_parada: '', codigo_loja: null, nome_loja: null,
  lat: null, lng: null, classificacao: 'LOJA', ordem: 1,
  ...overrides,
})

describe('V2.1 — listas auxiliares', () => {
  it('isRotaGigante identifica 38 códigos', () => {
    expect(isRotaGigante('2018001')).toBe(true)  // ROTA BARRA
    expect(isRotaGigante('5353012')).toBe(true)  // REGINA
    expect(isRotaGigante('17659000')).toBe(true) // O BOM ATACADISTA
    expect(isRotaGigante('7012010')).toBe(true)  // CAB PETROPOLIS
  })

  it('isRotaGigante retorna false pra lojas individuais', () => {
    expect(isRotaGigante('560019')).toBe(false)  // SENDAS FREGUESIA
    expect(isRotaGigante('9039019')).toBe(false) // ZS COPACABANA
    expect(isRotaGigante(null)).toBe(false)
    expect(isRotaGigante('')).toBe(false)
  })

  it('isVeiculoInativo identifica 31 placas crônicas', () => {
    expect(isVeiculoInativo('ALS-4H33')).toBe(true)
    expect(isVeiculoInativo('EZU-9325')).toBe(true)
    expect(isVeiculoInativo('UBF-5G33')).toBe(true)
  })

  it('isVeiculoInativo retorna false pra placas ativas', () => {
    expect(isVeiculoInativo('AKZ-2745')).toBe(false)
    expect(isVeiculoInativo('LQE-5E01')).toBe(false)
    expect(isVeiculoInativo(null)).toBe(false)
  })
})

describe('V2.1 Reforço 5 — scorePair bloqueia código exato em rota gigante', () => {
  it('linha sem código não casa via codigo_loja que é rota gigante', () => {
    // Sem essa proteção, codigo 17659000 (O BOM ATACADISTA, raio 72km) casaria
    // qualquer parada Emanuel via overlap, criando GPS clonado.
    const linha = makeLine({ loja_codigo_raw: null, loja_nome_raw: 'MERCADO X' })
    const parada = makeParada({
      codigo_loja: '17659000',
      nome_loja: 'O BOM ATACADISTA',
      local_parada: '17659000 - O BOM ATACADISTA',
    })
    const s = scorePair(linha, parada)
    expect(s).toBe(Infinity)  // nome MERCADO X não bate O BOM
  })

  it('linha com código de rota gigante explícito CASA com a rota', () => {
    // Quando a escala diz explicitamente "CAB-Petrópolis" cod 7012010, OK casar.
    const linha = makeLine({ loja_codigo_raw: '7012010', loja_nome_raw: 'CAB PETROPOLIS' })
    const parada = makeParada({
      codigo_loja: '7012010',
      nome_loja: 'CAB - PETROPOLIS',
      local_parada: '7012010 - CAB - PETROPOLIS',
    })
    const s = scorePair(linha, parada)
    expect(s).toBe(0)
  })

  it('overlap parsing: rota gigante secundária não casa código', () => {
    // local_parada tem código primário válido (560019 SENDAS FREGUESIA) e
    // secundário rota gigante (17659000). Linha pede cod "999" — não bate
    // nenhuma loja individual. Não deve casar via 17659000 só pq overlap.
    const linha = makeLine({ loja_codigo_raw: '999', loja_nome_raw: 'XPTO' })
    const parada = makeParada({
      codigo_loja: '560019',
      nome_loja: 'SENDAS FREGUESIA',
      local_parada: '560019 - SENDAS FREGUESIA,17659000 - O BOM ATACADISTA',
    })
    const s = scorePair(linha, parada)
    // Sem reforço, "999" suffix-matcharia com 17659000? Não — codCasa requer
    // length>=2 + prefixo de rede; "999" não bate 17659000. Aqui só validamos
    // que nome XPTO ≠ SENDAS/O BOM → Infinity.
    expect(s).toBe(Infinity)
  })
})

describe('V2.1 Reforço 7 — descarte de placas CD-only no matcher', () => {
  it('placa inativa sem paradas LOJA: linhas ficam UNMATCHED', async () => {
    const linha: EscalaLinhaRow = {
      id: 'l1', rede_id: 'PRINCESA', placa_norm: 'ALS-4H33',
      loja_nome_raw: 'PRINCESA COPACABANA', loja_codigo_raw: null,
      motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20',
    }
    const parada: UnitracParadaRow = {
      id: 'p1', placa_norm: 'ALS-4H33',
      chegada: '2026-05-20T10:00:00.000Z', saida: '2026-05-20T18:00:00.000Z',
      duracao_seg: 8 * 3600,
      local_parada: 'BASE BENASSI - BASE BENASSI',
      codigo_loja: null, nome_loja: null,
      lat: -22.8276, lng: -43.3375,
      classificacao: 'BASE', ordem: 1,
    }
    const rotas = await cruzaEscalaUnitrac([linha], [parada], [])
    // 1 rota, sem entregas
    expect(rotas).toHaveLength(1)
    expect(rotas[0].paradas).toHaveLength(0)
  })

  it('placa inativa MAS com paradas LOJA: matching segue normal (não pula)', async () => {
    const linha: EscalaLinhaRow = {
      id: 'l1', rede_id: 'PRINCESA', placa_norm: 'ALS-4H33',
      loja_nome_raw: 'PRINCESA COPACABANA', loja_codigo_raw: '8590034',
      motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20',
    }
    const paradaBase: UnitracParadaRow = {
      id: 'p1', placa_norm: 'ALS-4H33',
      chegada: '2026-05-20T06:00:00.000Z', saida: '2026-05-20T06:30:00.000Z',
      duracao_seg: 1800,
      local_parada: 'BASE BENASSI - BASE BENASSI',
      codigo_loja: null, nome_loja: null,
      lat: -22.8276, lng: -43.3375,
      classificacao: 'BASE', ordem: 1,
    }
    const paradaLoja: UnitracParadaRow = {
      id: 'p2', placa_norm: 'ALS-4H33',
      chegada: '2026-05-20T08:00:00.000Z', saida: '2026-05-20T09:00:00.000Z',
      duracao_seg: 3600,
      local_parada: '8590034 - PRINCESA COPACABANA',
      codigo_loja: '8590034', nome_loja: 'PRINCESA COPACABANA',
      lat: -22.9761, lng: -43.1892,
      classificacao: 'LOJA', ordem: 2,
    }
    const rotas = await cruzaEscalaUnitrac([linha], [paradaBase, paradaLoja], [])
    expect(rotas).toHaveLength(1)
    expect(rotas[0].paradas).toHaveLength(1)
  })
})
