import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarKpiLojaXlsx } from './gerador-kpi-loja'
import type { LinhaKpiLojaNutrimax } from './types'

function linha(overrides: Partial<LinhaKpiLojaNutrimax> = {}): LinhaKpiLojaNutrimax {
  return {
    loja: 'WW CARNES MERCEARIA EIRELI', motorista: 'LUAN VIANA', placaNorm: 'TTL7D40',
    saidaBase: '2026-08-06T07:00:00.000Z', chegadaLoja: '2026-08-06T10:20:00.000Z',
    saidaLoja: '2026-08-06T10:35:00.000Z', tempoNaLojaMin: 15,
    chegadaBase: '2026-08-06T12:00:00.000Z', tempoOperacaoMin: 300, kmPercorrido: 42.3,
    status: 'confirmado', ...overrides,
  }
}

describe('gerarKpiLojaXlsx', () => {
  it('gera um XLSX válido com uma linha de header + uma por loja', async () => {
    const buf = await gerarKpiLojaXlsx([linha(), linha({ loja: 'OUTRA LOJA', status: 'pendente', chegadaLoja: null })], '2026-08-06')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]
    // linha 1 = título, linha 2 = subtítulo, linha 3 = header, 4+ = dados
    expect(ws.getRow(3).getCell(1).value).toBe('LOJA')
    expect(ws.getRow(4).getCell(1).value).toBe('WW CARNES MERCEARIA EIRELI')
    expect(ws.getRow(5).getCell(1).value).toBe('OUTRA LOJA')
  })
})
