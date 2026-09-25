import { describe, it, expect } from 'vitest'
import {
  normalizarTextoOcorrencia, mapearResolucao, detectarColunas, montarResolucoesDaPlanilha,
  extrairTextoCelula, resolucaoJaVigente,
} from './importar-ocorrencias'
import type { ResolucaoNfRow } from '../src/lib/kpi-romaneio/resolucoes'

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

  // Fix round 1, item 1: coluna de NF exige cabecalho EXATO (normalizado),
  // nao substring -- "Confirmação"/"Informação"/"Conferência" contem "nf"
  // dentro da propria palavra (co-N-F-irmacao, i-N-F-ormacao, co-N-F-erencia)
  // e viravam falso positivo com o match antigo por `includes`.
  it('cabecalhos que CONTEM "nf" dentro da palavra (falso positivo do includes antigo) nao casam com a coluna NF', () => {
    expect(detectarColunas(['Confirmação NF', 'Resolução'])).toBeNull()
    expect(detectarColunas(['Informação', 'Resolução'])).toBeNull()
    expect(detectarColunas(['Conferência', 'Resolução'])).toBeNull()
    expect(detectarColunas(['Status NF', 'Resolução'])).toBeNull()
  })

  it('so aceita cabecalho de NF exatamente igual (normalizado) a um dos rotulos conhecidos', () => {
    expect(detectarColunas(['NF', 'Resolução'])).toEqual({ nf: 0, resolucao: 1 })
    expect(detectarColunas(['N F', 'Resolução'])).toEqual({ nf: 0, resolucao: 1 })
    expect(detectarColunas(['Nota Fiscal', 'Resolução'])).toEqual({ nf: 0, resolucao: 1 })
    expect(detectarColunas(['Nota', 'Resolução'])).toEqual({ nf: 0, resolucao: 1 })
    expect(detectarColunas(['Numero NF', 'Resolução'])).toEqual({ nf: 0, resolucao: 1 })
    expect(detectarColunas(['Nº NF', 'Resolução'])).toEqual({ nf: 0, resolucao: 1 })
  })
})

describe('extrairTextoCelula (Fix round 1, item 2: valor de celula do ExcelJS pode ser objeto)', () => {
  it('valores simples (string/numero/boolean) viram string', () => {
    expect(extrairTextoCelula('2386225')).toBe('2386225')
    expect(extrairTextoCelula(2386225)).toBe('2386225')
  })

  it('celula vazia (null/undefined) vira string vazia, nao null -- continua sendo "NF vazia", nao erro de leitura', () => {
    expect(extrairTextoCelula(null)).toBe('')
    expect(extrairTextoCelula(undefined)).toBe('')
  })

  it('resultado de formula ({formula, result}) usa o result', () => {
    expect(extrairTextoCelula({ formula: 'A1', result: 'Entregue no local' })).toBe('Entregue no local')
    expect(extrairTextoCelula({ formula: 'A1', result: 215999 })).toBe('215999')
  })

  it('rich text ({richText: [...]}) concatena os pedacos de texto', () => {
    expect(extrairTextoCelula({ richText: [{ text: 'Entregue ' }, { text: 'no local' }] })).toBe('Entregue no local')
  })

  it('hyperlink ({text, hyperlink}) usa o text visivel', () => {
    expect(extrairTextoCelula({ text: 'Entregue no local', hyperlink: 'http://x' })).toBe('Entregue no local')
  })

  it('objeto sem forma reconhecida devolve null -- NUNCA vira "[object Object]"', () => {
    expect(extrairTextoCelula({ algumaCoisaEstranha: true })).toBeNull()
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

  // Fix round 1, item 2: celula que extrairTextoCelula nao conseguiu ler
  // (objeto sem forma reconhecida -- vem como `null` do leitor real) pula a
  // linha e entra em naoMapeadas, NUNCA vira "[object Object]" gravado.
  it('celula de NF ou de resolução ilegivel (null, vindo de extrairTextoCelula) pula a linha e reporta em naoMapeadas -- nunca grava', () => {
    const linhasComCelulaIlegivel: (string | null)[][] = [
      ['NF', 'Resolução'],
      [null, 'Entregue no local'],
      ['999999', null],
      ['100001', 'Entregue no local'],
    ]
    const resultado = montarResolucoesDaPlanilha(linhasComCelulaIlegivel, { empresa: 'NUTRY MAX', data: '2026-09-23', responsavel: 'ANA' })
    expect(resultado.resolucoes).toEqual([
      { empresa: 'NUTRY MAX', data: '2026-09-23', nf: '100001', resolucao: 'entregue', placa_executora: null, observacao: null, responsavel: 'ANA', documento: null },
    ])
    expect(resultado.naoMapeadas).toEqual([
      { linha: 2, motivo: 'célula de NF não pôde ser lida (fórmula/rich text/hyperlink sem valor extraível)' },
      { linha: 3, motivo: 'célula de resolução não pôde ser lida (fórmula/rich text/hyperlink sem valor extraível)' },
    ])
  })
})

function resolucaoRow(overrides: Partial<ResolucaoNfRow> = {}): ResolucaoNfRow {
  return {
    id: 1, empresa: 'NUTRY MAX', data: '2026-09-23', nf: 'NF1',
    resolucao: 'entregue', placa_executora: null, observacao: null,
    responsavel: 'ANA', documento: null, criado_em: '2026-09-23T10:00:00.000Z',
    ...overrides,
  }
}

// Fix round 1, item 3: rodar --aplicar duas vezes com a MESMA planilha nao
// pode duplicar -- so' grava se a resolucao vigente atual for DIFERENTE em
// algum dos 4 campos que importam pro relatorio.
describe('resolucaoJaVigente (idempotencia do --aplicar)', () => {
  it('sem nenhuma resolucao vigente (atual=null): sempre precisa gravar', () => {
    expect(resolucaoJaVigente(null, { empresa: 'NUTRY MAX', data: '2026-09-23', nf: 'NF1', resolucao: 'entregue', placa_executora: null, observacao: null, responsavel: 'ANA', documento: null })).toBe(false)
  })

  it('mesma resolucao+observacao+responsavel+placa_executora: nao precisa gravar de novo', () => {
    const atual = resolucaoRow({ resolucao: 'entregue_outra_placa', placa_executora: 'TUS1B06', responsavel: 'ANA', observacao: null })
    const nova = { empresa: 'NUTRY MAX', data: '2026-09-23', nf: 'NF1', resolucao: 'entregue_outra_placa' as const, placa_executora: 'TUS1B06', observacao: null, responsavel: 'ANA', documento: null }
    expect(resolucaoJaVigente(atual, nova)).toBe(true)
  })

  it('resolucao diferente da vigente: precisa gravar', () => {
    const atual = resolucaoRow({ resolucao: 'nao_esteve_no_local' })
    const nova = { empresa: 'NUTRY MAX', data: '2026-09-23', nf: 'NF1', resolucao: 'entregue' as const, placa_executora: null, observacao: null, responsavel: 'ANA', documento: null }
    expect(resolucaoJaVigente(atual, nova)).toBe(false)
  })

  it('responsavel diferente do vigente: precisa gravar (mesmo com a mesma resolucao)', () => {
    const atual = resolucaoRow({ responsavel: 'ANA' })
    const nova = { empresa: 'NUTRY MAX', data: '2026-09-23', nf: 'NF1', resolucao: 'entregue' as const, placa_executora: null, observacao: null, responsavel: 'CARLOS', documento: null }
    expect(resolucaoJaVigente(atual, nova)).toBe(false)
  })

  it('placa_executora diferente: precisa gravar', () => {
    const atual = resolucaoRow({ resolucao: 'entregue_outra_placa', placa_executora: 'TUS1B06' })
    const nova = { empresa: 'NUTRY MAX', data: '2026-09-23', nf: 'NF1', resolucao: 'entregue_outra_placa' as const, placa_executora: 'OUTRAPLACA', observacao: null, responsavel: 'ANA', documento: null }
    expect(resolucaoJaVigente(atual, nova)).toBe(false)
  })
})
