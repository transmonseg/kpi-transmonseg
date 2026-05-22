import { describe, it, expect } from 'vitest'
import { isHeaderLikeRow } from './escala-geral'

describe('isHeaderLikeRow (Bug #3 — cabeçalhos vazando como dado)', () => {
  it('rejeita linha com placa="PLACAS"', () => {
    expect(isHeaderLikeRow('PLACAS', 'Loja Qualquer')).toBe(true)
  })

  it('rejeita linha com placa="FORNECEDOR"', () => {
    expect(isHeaderLikeRow('FORNECEDOR', 'Loja Qualquer')).toBe(true)
  })

  it('rejeita linha com placa="PLACA" (singular)', () => {
    expect(isHeaderLikeRow('PLACA', 'Loja Qualquer')).toBe(true)
  })

  it('rejeita tokens de placa em caixa baixa / com espaços', () => {
    expect(isHeaderLikeRow(' placas ', null)).toBe(true)
    expect(isHeaderLikeRow('fornecedor', null)).toBe(true)
  })

  it('rejeita linha com loja="REDES/ FILIAIS" (espaço após a barra)', () => {
    expect(isHeaderLikeRow('ABC1234', 'REDES/ FILIAIS')).toBe(true)
  })

  it('rejeita variações de "REDES / FILIAIS" com espaços', () => {
    expect(isHeaderLikeRow('ABC1234', 'REDES/FILIAIS')).toBe(true)
    expect(isHeaderLikeRow('ABC1234', 'REDES / FILIAIS')).toBe(true)
    expect(isHeaderLikeRow('ABC1234', 'REDES /FILIAIS')).toBe(true)
    expect(isHeaderLikeRow('ABC1234', 'redes/ filiais')).toBe(true)
  })

  it('mantém linha válida (placa real + loja real)', () => {
    expect(isHeaderLikeRow('ABC1234', 'VIANENSE - LOJA 05')).toBe(false)
    expect(isHeaderLikeRow('ABC1D23', 'ASSAI BARRA')).toBe(false)
  })

  it('mantém linha sem placa nem loja (não é cabeçalho conhecido)', () => {
    expect(isHeaderLikeRow(null, null)).toBe(false)
    expect(isHeaderLikeRow('', '')).toBe(false)
  })

  it('NÃO confunde loja real contendo "REDES" com cabeçalho', () => {
    // Hipotético: nome de loja que tenha "REDES" mas não seja o header
    expect(isHeaderLikeRow('ABC1234', 'REDES SUPERMERCADOS LTDA')).toBe(false)
  })
})
