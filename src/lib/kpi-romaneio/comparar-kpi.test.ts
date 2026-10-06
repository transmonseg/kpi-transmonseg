import { describe, it, expect } from 'vitest'
import { compararDetalhes } from './comparar-kpi'

const d = (o: Record<string, unknown>) => ({ carga: '1', placa: 'AAA1A11', nf: '10', status: 'confirmado_gps', observacao: null, chegada: '2026-10-03T10:00:00', saida: '2026-10-03T10:10:00', tempoParadaMin: 10, motivo: 'm', ...o }) as never

describe('compararDetalhes', () => {
  it('iguais: sem diferença', () => {
    expect(compararDetalhes([d({})], [d({})])).toEqual([])
  })
  it('status diferente: aponta NF e campo', () => {
    expect(compararDetalhes([d({})], [d({ status: 'pendente' })])).toEqual(['1::AAA1A11::10 status: confirmado_gps ≠ pendente'])
  })
  it('NF só de um lado', () => {
    expect(compararDetalhes([d({}), d({ nf: '11' })], [d({})])).toEqual(['1::AAA1A11::11 só em A'])
    expect(compararDetalhes([d({})], [d({}), d({ nf: '12' })])).toEqual(['1::AAA1A11::12 só em B'])
  })
  it('null e undefined contam como iguais (JSON apaga undefined)', () => {
    expect(compararDetalhes([d({ observacao: undefined })], [d({ observacao: null })])).toEqual([])
  })
})
