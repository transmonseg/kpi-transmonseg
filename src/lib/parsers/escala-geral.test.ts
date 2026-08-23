import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { isHeaderLikeRow, parseEscalaGeral } from './escala-geral'

// Monta uma aba mínima com 1 linha de dado válida (loja + motorista + placa),
// nas mesmas colunas que parseDayTab espera de uma linha normal (não-separador).
function montaAbaComLinha(wb: ExcelJS.Workbook, nomeAba: string) {
  const ws = wb.addWorksheet(nomeAba)
  // Linhas 1-4 são cabeçalho/ignoradas (parseDayTab começa em rowNum > 4)
  for (let i = 1; i <= 4; i++) ws.addRow([])
  // col4 != col1 (senão vira "isMergedHeader" e a linha é tratada como separador)
  ws.addRow([
    'ASSAI - BANGU I - LOJA 55', // 1 loja
    500, // 2 peso
    10, // 3 paletes
    1, // 4 diferenciador (qty)
    'VW DELIVERY', // 5 tipo_carro
    'FABIO SILVA', // 6 motorista
    353, // 7 codigo motorista
    'UBF5G37', // 8 placa (Mercosul válida)
  ])
}

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

describe('parseEscalaGeral — aba com sufixo de duplicação do Excel (ex: "18 (2)")', () => {
  it('reconhece aba "18 (2)" como dia 18 quando dataAlvo é 2026-08-18', async () => {
    const wb = new ExcelJS.Workbook()
    montaAbaComLinha(wb, '18 (2)')
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer

    const linhas = await parseEscalaGeral(buf, '2026-08-18')

    expect(linhas).toHaveLength(1)
    expect(linhas[0].data).toBe('2026-08-18')
    expect(linhas[0].motorista_nome).toBe('FABIO SILVA')
    expect(linhas[0].placa_norm).toBe('UBF5G37')
  })

  it('não confunde aba "18 (2)" com outra aba de dia diferente (ex: "17")', async () => {
    const wb = new ExcelJS.Workbook()
    montaAbaComLinha(wb, '17')
    montaAbaComLinha(wb, '18 (2)')
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer

    const linhasDia17 = await parseEscalaGeral(buf, '2026-08-17')
    const linhasDia18 = await parseEscalaGeral(buf, '2026-08-18')

    expect(linhasDia17).toHaveLength(1)
    expect(linhasDia17[0].data).toBe('2026-08-17')
    expect(linhasDia18).toHaveLength(1)
    expect(linhasDia18[0].data).toBe('2026-08-18')
  })
})
