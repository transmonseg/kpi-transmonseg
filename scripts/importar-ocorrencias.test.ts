import { describe, it, expect } from 'vitest'
import { normalizarTextoOcorrencia, mapearResolucao, detectarColunas, montarResolucoesDaPlanilha } from './importar-ocorrencias'

describe('normalizarTextoOcorrencia', () => {
  it('tira acento, baixa caixa e colapsa espaco', () => {
    expect(normalizarTextoOcorrencia('  Não   Esteve no Local  ')).toBe('nao esteve no local')
  })

  it('normaliza espaco em volta do hifen (com ou sem espaco de cada lado)', () => {
    expect(normalizarTextoOcorrencia('Entregue no local- tempo de loja conferido'))
      .toBe(normalizarTextoOcorrencia('Entregue no local -tempo de loja conferido'))
    expect(normalizarTextoOcorrencia('Entregue no local -  tempo de loja conferido'))
      .toBe(normalizarTextoOcorrencia('Entregue no local - tempo de loja conferido'))
  })
})

// Textos EXATOS da equipe (brief da Task 4) -- tolerante a acento/caixa/espaco.
describe('mapearResolucao', () => {
  it.each([
    ['Entregue no local', 'entregue'],
    ['entregue no local', 'entregue'],
    ['  ENTREGUE NO LOCAL  ', 'entregue'],
    ['Entregue no local - tempo de loja conferido', 'entregue_tempo_conferido'],
    ['entregue no local -tempo de loja conferido', 'entregue_tempo_conferido'],
    ['Entregue no local - rastro oscilante', 'entregue_rastro_oscilante'],
    ['Entregue por outra placa', 'entregue_outra_placa'],
    ['Não esteve no local', 'nao_esteve_no_local'],
    ['nao esteve no local', 'nao_esteve_no_local'],
    ['Desatualizado', 'desatualizado'],
    ['DESATUALIZADO', 'desatualizado'],
  ] as const)('%s -> %s', (texto, esperado) => {
    expect(mapearResolucao(texto)).toBe(esperado)
  })

  it('texto desconhecido devolve null (nunca inventa mapeamento)', () => {
    expect(mapearResolucao('Motorista se recusou')).toBeNull()
    expect(mapearResolucao('')).toBeNull()
  })
})

describe('detectarColunas', () => {
  it('acha NF e RESOLUÇÃO/OCORRÊNCIA pelo cabecalho, tolerante a acento/caixa', () => {
    expect(detectarColunas(['NF', 'Cliente', 'Resolução'])).toEqual({ nf: 0, resolucao: 2 })
    expect(detectarColunas(['nf', 'ocorrencia'])).toEqual({ nf: 0, resolucao: 1 })
    expect(detectarColunas(['Nota Fiscal', 'Status Operação'])).toEqual({ nf: 0, resolucao: 1 })
  })

  it('nao acha uma das colunas -- devolve null (chamador decide o que fazer, sem adivinhar)', () => {
    expect(detectarColunas(['Cliente', 'Endereço'])).toBeNull()
    expect(detectarColunas(['NF', 'Cliente'])).toBeNull()
  })
})

describe('montarResolucoesDaPlanilha', () => {
  const linhas = [
    ['NF', 'Resolução'],
    ['2386225', 'Não esteve no local'],
    ['215999', 'Entregue por outra placa'],
    ['100001', 'Entregue no local'],
    ['100002', 'Texto desconhecido da equipe'],
    ['', 'Entregue no local'], // NF vazia -- ignora
  ]

  it('mapeia as linhas reconhecidas, empresa/data/responsavel vem do chamador (CLI)', () => {
    const resultado = montarResolucoesDaPlanilha(linhas, { empresa: 'NUTRY MAX', data: '2026-09-23', responsavel: 'ANA' })
    expect(resultado.resolucoes).toEqual([
      { empresa: 'NUTRY MAX', data: '2026-09-23', nf: '2386225', resolucao: 'nao_esteve_no_local', placa_executora: null, observacao: null, responsavel: 'ANA', documento: null },
      { empresa: 'NUTRY MAX', data: '2026-09-23', nf: '215999', resolucao: 'entregue_outra_placa', placa_executora: null, observacao: null, responsavel: 'ANA', documento: null },
      { empresa: 'NUTRY MAX', data: '2026-09-23', nf: '100001', resolucao: 'entregue', placa_executora: null, observacao: null, responsavel: 'ANA', documento: null },
    ])
  })

  it('linhas nao mapeadas (texto desconhecido, NF vazia) vao pra naoMapeadas -- nada e descartado em silencio', () => {
    const resultado = montarResolucoesDaPlanilha(linhas, { empresa: 'NUTRY MAX', data: '2026-09-23', responsavel: 'ANA' })
    expect(resultado.naoMapeadas).toEqual([
      { linha: 5, motivo: 'texto de resolução não reconhecido: "Texto desconhecido da equipe"' },
      { linha: 6, motivo: 'NF vazia' },
    ])
  })

  it('sem cabecalho reconhecivel, lanca erro (chamador nao deve seguir sem colunas)', () => {
    const semCabecalho = [['A', 'B'], ['1', '2']]
    expect(() => montarResolucoesDaPlanilha(semCabecalho, { empresa: 'NUTRY MAX', data: '2026-09-23', responsavel: 'ANA' }))
      .toThrow(/coluna/i)
  })
})
