import { describe, it, expect } from 'vitest'
import { montarUpsertCorrecao, csvCorrecoes, csvCadastrosDivergentes, paradasConfiaveis } from './corrigir-geocode-por-alvo'
import type { SugestaoCorrecao } from '../src/lib/kpi-romaneio/correcao-por-alvo'
import type { HorarioBase, ParadaBridge } from '../src/lib/kpi-romaneio/base-horarios'

const s = (o: Partial<SugestaoCorrecao>): SugestaoCorrecao => ({
  endereco: 'RUA X, 1 - LOTE  28  QUADRA  24', nfs: ['1', '2'], placaNorm: 'AAA1A11',
  latAtual: -22.67, lngAtual: -43.30, distAtualM: 1200, latNova: -22.68, lngNova: -43.29, duracaoParadaMin: 8,
  codigoUnitrac: '5904', cadastroLat: -22.70, cadastroLng: -43.31, distCadastroM: 2500, ...o,
})

describe('montarUpsertCorrecao', () => {
  it('chave = endereco CRU (espaco duplo preservado), coordenada da parada, confiavel e motivo limpo', () => {
    expect(montarUpsertCorrecao(s({}))).toEqual({
      endereco: 'RUA X, 1 - LOTE  28  QUADRA  24', lat: -22.68, lng: -43.29, confiavel: true, motivo: null, fonte: 'parada_alvo',
    })
  })
})

describe('csvCadastrosDivergentes', () => {
  it('so lista cadastro a mais de 500m da parada real; ignora sem cadastro', () => {
    const csv = csvCadastrosDivergentes([s({}), s({ codigoUnitrac: '9', distCadastroM: 100 }), s({ codigoUnitrac: '8', cadastroLat: null, cadastroLng: null, distCadastroM: null })])
    const linhas = csv.trim().split('\n')
    expect(linhas).toHaveLength(2)
    expect(linhas[1]).toContain('5904')
  })
})

describe('csvCorrecoes', () => {
  it('uma linha por sugestao e por rejeicao, separador ; e endereco sem ; quebrando coluna', () => {
    const csv = csvCorrecoes([s({ endereco: 'A; B' })], [{ endereco: 'C', nf: '9', placaNorm: 'P', motivo: 'ilha' }])
    const linhas = csv.trim().split('\n')
    expect(linhas).toHaveLength(3)
    expect(linhas[1].split(';').length).toBe(linhas[0].split(';').length)
    expect(linhas[2]).toContain('ilha')
  })
})

describe('paradasConfiaveis', () => {
  const parada: ParadaBridge = { chegada: '2026-09-22T10:00:00Z', saida: '2026-09-22T10:10:00Z', duracaoSeg: 600, lat: -22.68, lng: -43.29, classificacao: 'FORA_BASE' }

  it('placa com apagaoDeSinal true -> lista vazia', () => {
    const horarios = new Map<string, HorarioBase>([
      ['AAA1A11', { saidaBase: null, chegadaBase: null, kmPercorrido: null, paradas: [parada], apagaoDeSinal: true }],
    ])
    const { paradasPorPlaca, placasEmApagao } = paradasConfiaveis(horarios)
    expect(paradasPorPlaca.get('AAA1A11')).toEqual([])
    expect(placasEmApagao).toEqual(['AAA1A11'])
  })

  it('placa com apagaoDeSinal false -> mantem paradas', () => {
    const horarios = new Map<string, HorarioBase>([
      ['BBB2B22', { saidaBase: null, chegadaBase: null, kmPercorrido: null, paradas: [parada], apagaoDeSinal: false }],
    ])
    const { paradasPorPlaca, placasEmApagao } = paradasConfiaveis(horarios)
    expect(paradasPorPlaca.get('BBB2B22')).toEqual([parada])
    expect(placasEmApagao).toEqual([])
  })

  it('placa sem paradas definido -> lista vazia', () => {
    const horarios = new Map<string, HorarioBase>([
      ['CCC3C33', { saidaBase: null, chegadaBase: null, kmPercorrido: null }],
    ])
    const { paradasPorPlaca, placasEmApagao } = paradasConfiaveis(horarios)
    expect(paradasPorPlaca.get('CCC3C33')).toEqual([])
    expect(placasEmApagao).toEqual([])
  })
})
