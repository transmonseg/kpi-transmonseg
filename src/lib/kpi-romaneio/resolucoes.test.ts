import { describe, it, expect } from 'vitest'
import { resolucaoVigente, aplicarResolucoes } from './resolucoes'
import type { ResolucaoNfRow } from './resolucoes'
import type { LinhaDetalheEntrega } from './types'

function linhaResolucao(overrides: Partial<ResolucaoNfRow> = {}): ResolucaoNfRow {
  return {
    id: 1, empresa: 'NUTRY MAX', data: '2026-09-23', nf: 'NF1',
    resolucao: 'entregue', placa_executora: null, observacao: null,
    responsavel: 'ANA', documento: null, criado_em: '2026-09-23T10:00:00.000Z',
    ...overrides,
  }
}

function detalheFixture(overrides: Partial<LinhaDetalheEntrega> = {}): LinhaDetalheEntrega {
  return {
    carga: 'C001', placa: 'ABC1234', motorista: 'JOAO SILVA', clienteCodigo: 'CLI001',
    nf: 'NF1', clienteNome: 'CLIENTE A', endereco: 'RUA A, 1',
    saidaCd: null, chegadaCd: null, tempoOperacaoMin: null,
    chegada: null, saida: null, tempoParadaMin: null, status: 'pendente',
    temRastreador: true, observacao: null,
    ...overrides,
  }
}

describe('resolucaoVigente', () => {
  it('devolve a linha de maior criado_em', () => {
    const antiga = linhaResolucao({ id: 1, resolucao: 'nao_esteve_no_local', criado_em: '2026-09-23T08:00:00.000Z' })
    const recente = linhaResolucao({ id: 2, resolucao: 'entregue', criado_em: '2026-09-23T12:00:00.000Z' })
    // ordem de entrada nao importa -- so' o criado_em decide.
    expect(resolucaoVigente([antiga, recente])).toEqual(recente)
    expect(resolucaoVigente([recente, antiga])).toEqual(recente)
  })

  it('lista vazia devolve null', () => {
    expect(resolucaoVigente([])).toBeNull()
  })

  it('uma unica linha e a propria vigente', () => {
    const unica = linhaResolucao()
    expect(resolucaoVigente([unica])).toEqual(unica)
  })
})

describe('aplicarResolucoes', () => {
  it('adiciona resolucaoManual/responsavel sem alterar status/observacao automaticos', () => {
    const detalhe = [detalheFixture({ status: 'pendente', observacao: null })]
    const resolucao = linhaResolucao({ resolucao: 'entregue', responsavel: 'ANA' })
    const resultado = aplicarResolucoes(detalhe, [resolucao])

    expect(resultado[0].status).toBe('pendente') // automatico intacto
    expect(resultado[0].observacao).toBeNull() // automatico intacto
    expect(resultado[0].resolucaoManual).toBe('entregue')
    expect(resultado[0].responsavelResolucao).toBe('ANA')
  })

  it('NF resolvida que nao esta no detalhe (sumiu do romaneio na regeracao) e ignorada sem erro', () => {
    const detalhe = [detalheFixture({ nf: 'NF1' })]
    const resolucao = linhaResolucao({ nf: 'NF-QUE-SUMIU' })
    expect(() => aplicarResolucoes(detalhe, [resolucao])).not.toThrow()
    const resultado = aplicarResolucoes(detalhe, [resolucao])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].resolucaoManual).toBeUndefined()
  })

  it('duas resolucoes da mesma NF: vale a mais recente na aplicacao (historico continua intacto na tabela, so nao muda aqui)', () => {
    const detalhe = [detalheFixture({ nf: 'NF1' })]
    const primeira = linhaResolucao({ nf: 'NF1', resolucao: 'nao_esteve_no_local', criado_em: '2026-09-23T08:00:00.000Z', responsavel: 'ANA' })
    const segunda = linhaResolucao({ nf: 'NF1', resolucao: 'entregue', criado_em: '2026-09-23T18:00:00.000Z', responsavel: 'CARLOS' })
    const resultado = aplicarResolucoes(detalhe, [primeira, segunda])

    expect(resultado[0].resolucaoManual).toBe('entregue')
    expect(resultado[0].responsavelResolucao).toBe('CARLOS')
  })

  it('entregue_outra_placa carrega a placa executora pro detalhe', () => {
    const detalhe = [detalheFixture({ nf: 'NF1', placa: 'RQU5J45' })]
    const resolucao = linhaResolucao({ nf: 'NF1', resolucao: 'entregue_outra_placa', placa_executora: 'TUS1B06' })
    const resultado = aplicarResolucoes(detalhe, [resolucao])

    expect(resultado[0].resolucaoManual).toBe('entregue_outra_placa')
    expect(resultado[0].placaExecutoraResolucao).toBe('TUS1B06')
  })

  it('sem nenhuma resolucao (lista vazia): detalhe volta identico', () => {
    const detalhe = [detalheFixture()]
    const resultado = aplicarResolucoes(detalhe, [])
    expect(resultado).toEqual(detalhe)
  })
})
