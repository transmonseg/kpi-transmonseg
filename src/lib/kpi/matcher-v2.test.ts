import { describe, it, expect } from 'vitest'
import { cruzaEscalaUnitracV2 } from './matcher-v2'
import type { EscalaLinhaRow, UnitracParadaRow, LojaRow } from './matcher'

function mkLinha(over: Partial<EscalaLinhaRow>): EscalaLinhaRow {
  return {
    id: 'l1',
    rede_id: 'PREZUNIC',
    placa_norm: 'AAA1234',
    loja_nome_raw: 'Loja Teste',
    loja_codigo_raw: null,
    motorista_nome: 'Joao',
    carro_ordem: 1,
    data_entrega: '2026-05-22',
    sub_rede: null,
    ...over,
  }
}

function mkLoja(over: Partial<LojaRow>): LojaRow {
  return {
    id: 'loja-1',
    rede_id: 'PREZUNIC',
    nome: 'Loja Teste',
    nome_normalizado: 'LOJA TESTE',
    codigo_escala: null,
    codigo_unitrac: null,
    nome_unitrac: null,
    lat: null,
    lng: null,
    raio_metros: 200,
    ...over,
  }
}

function mkParada(over: Partial<UnitracParadaRow>): UnitracParadaRow {
  return {
    id: 'p1',
    placa_norm: 'AAA1234',
    chegada: '2026-05-22T07:00:00Z',
    saida: '2026-05-22T08:00:00Z',
    duracao_seg: 3600,
    local_parada: '',
    codigo_loja: null,
    nome_loja: null,
    lat: null,
    lng: null,
    classificacao: 'LOJA',
    ordem: 1,
    ...over,
  }
}

describe('matcher-v2', () => {
  it('linha sem placa → SEM rastreador', () => {
    const linha = mkLinha({ placa_norm: null })
    const { rotas, stats } = cruzaEscalaUnitracV2([linha], [], [])
    expect(rotas[0].status).toBe('sem_entrega')
    expect(rotas[0].paradas).toHaveLength(0)
    expect(stats.semPlaca).toBe(1)
  })

  it('placa sem paradas no Unitrac → SEM rastreador', () => {
    const linha = mkLinha({ placa_norm: 'BBB9999' })
    const { rotas, stats } = cruzaEscalaUnitracV2([linha], [], [])
    expect(rotas[0].status).toBe('sem_entrega')
    expect(stats.semGps).toBe(1)
  })

  it('match por codigo_unitrac exato', () => {
    const linha = mkLinha({ loja_nome_raw: 'Loja Teste' })
    const loja = mkLoja({ codigo_unitrac: 'COD123', nome_normalizado: 'LOJA TESTE' })
    const parada = mkParada({ codigo_loja: 'COD123', nome_loja: 'ALGUM NOME' })
    const { rotas, stats } = cruzaEscalaUnitracV2([linha], [parada], [loja])
    expect(rotas[0].status).toBe('ok')
    expect(rotas[0].paradas[0].parada_id).toBe('p1')
    expect(rotas[0].paradas[0].loja_id).toBe('loja-1')
    expect(stats.matchedPorCodigo).toBe(1)
  })

  it('match por nome_unitrac quando código não bate', () => {
    const linha = mkLinha({ loja_nome_raw: 'Loja Teste' })
    const loja = mkLoja({ codigo_unitrac: 'NAO_EXISTE', nome_unitrac: 'LOJA UNITRAC' })
    const parada = mkParada({ codigo_loja: 'OUTRO_COD', nome_loja: 'LOJA UNITRAC' })
    const { rotas, stats } = cruzaEscalaUnitracV2([linha], [parada], [loja])
    expect(rotas[0].status).toBe('ok')
    expect(stats.matchedPorNome).toBe(1)
  })

  it('placa tem parada mas em OUTRA loja (cross-rede) → em branco', () => {
    // Loja A da escala, placa fez parada em loja B
    const linha = mkLinha({ loja_nome_raw: 'Loja A' })
    const loja = mkLoja({ id: 'loja-a', nome_normalizado: 'LOJA A', codigo_unitrac: 'CODA' })
    const parada = mkParada({ codigo_loja: 'CODB', nome_loja: 'LOJA B' })
    const { rotas, stats } = cruzaEscalaUnitracV2([linha], [parada], [loja])
    expect(rotas[0].status).toBe('sem_entrega')
    expect(rotas[0].paradas).toHaveLength(0)
    expect(stats.semMatchParada).toBe(1)
  })

  it('NÃO usa fallback geo/fuzzy', () => {
    // Loja cadastrada com lat/lng mas SEM codigo_unitrac nem nome_unitrac
    // Parada com lat/lng IDÊNTICOS mas codigo/nome diferentes → matcher v2 NÃO casa
    const linha = mkLinha({})
    const loja = mkLoja({
      lat: -22.9068,
      lng: -43.1729,
      raio_metros: 100,
    })
    const parada = mkParada({
      codigo_loja: 'OUTRO',
      nome_loja: 'OUTRA LOJA',
      lat: -22.9068,
      lng: -43.1729,
    })
    const { rotas } = cruzaEscalaUnitracV2([linha], [parada], [loja])
    expect(rotas[0].status).toBe('sem_entrega')
  })

  it('match por loja_codigo_raw == codigo_escala', () => {
    const linha = mkLinha({ loja_codigo_raw: 'ESC42', loja_nome_raw: 'Nome qualquer' })
    const loja = mkLoja({
      codigo_escala: 'ESC42',
      codigo_unitrac: 'UNI42',
      nome_normalizado: 'NOME COMPLETAMENTE DIFERENTE',
    })
    const parada = mkParada({ codigo_loja: 'UNI42' })
    const { rotas } = cruzaEscalaUnitracV2([linha], [parada], [loja])
    expect(rotas[0].status).toBe('ok')
  })

  it('cross-rede: escala PREZUNIC não casa com loja VIANENSE de mesmo nome', () => {
    const linha = mkLinha({ rede_id: 'PREZUNIC', loja_nome_raw: 'Freguesia' })
    const loja = mkLoja({ rede_id: 'VIANENSE', nome_normalizado: 'FREGUESIA', codigo_unitrac: 'C1' })
    const parada = mkParada({ codigo_loja: 'C1' })
    const { rotas, stats } = cruzaEscalaUnitracV2([linha], [parada], [loja])
    expect(rotas[0].status).toBe('pendente')
    expect(stats.semLojaCadastrada).toBe(1)
  })

  it('calcula saida_cd: última BASE antes da parada', () => {
    const linha = mkLinha({})
    const loja = mkLoja({ codigo_unitrac: 'COD123' })
    const base = mkParada({
      id: 'base1',
      classificacao: 'BASE',
      chegada: '2026-05-22T05:00:00Z',
      saida: '2026-05-22T06:30:00Z',
    })
    const parada = mkParada({ codigo_loja: 'COD123' })
    const { rotas } = cruzaEscalaUnitracV2([linha], [base, parada], [loja])
    expect(rotas[0].saida_cd?.toISOString()).toBe('2026-05-22T06:30:00.000Z')
  })

  it('saida_cd null quando nenhuma BASE antes', () => {
    const linha = mkLinha({})
    const loja = mkLoja({ codigo_unitrac: 'COD123' })
    const parada = mkParada({ codigo_loja: 'COD123' })  // só LOJA, sem BASE
    const { rotas } = cruzaEscalaUnitracV2([linha], [parada], [loja])
    expect(rotas[0].saida_cd).toBeNull()
  })

  it('múltiplas paradas LOJA da placa: pega a do código certo', () => {
    const linha = mkLinha({})
    const loja = mkLoja({ codigo_unitrac: 'CODCERTO' })
    const paradas = [
      mkParada({ id: 'p1', codigo_loja: 'CODERRADO', chegada: '2026-05-22T05:00:00Z' }),
      mkParada({ id: 'p2', codigo_loja: 'CODCERTO', chegada: '2026-05-22T07:00:00Z' }),
      mkParada({ id: 'p3', codigo_loja: 'OUTROCOD', chegada: '2026-05-22T09:00:00Z' }),
    ]
    const { rotas } = cruzaEscalaUnitracV2([linha], paradas, [loja])
    expect(rotas[0].paradas[0].parada_id).toBe('p2')
  })

  it('stats: contagens corretas', () => {
    const linhas = [
      mkLinha({ id: 'l1', placa_norm: null }),  // semPlaca
      mkLinha({ id: 'l2', placa_norm: 'NAO9999' }),  // semGps
      mkLinha({ id: 'l3' }),  // ok
    ]
    const loja = mkLoja({ codigo_unitrac: 'COD' })
    const parada = mkParada({ codigo_loja: 'COD' })
    const { stats } = cruzaEscalaUnitracV2(linhas, [parada], [loja])
    expect(stats.totalLinhas).toBe(3)
    expect(stats.semPlaca).toBe(1)
    expect(stats.semGps).toBe(1)
    expect(stats.matchedPorCodigo).toBe(1)
  })
})
