import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarKpiViagemXlsx } from './gerador-kpi-viagem'
import type { KpiViagemNutrimax } from './types'

const linha: KpiViagemNutrimax = {
  carga: '92593', placaRaw: 'TTL7D40', placaNorm: 'TTL7D40', destino: 'CAMPOS',
  motorista: 'LUAN VIANA AREAS RIBEIRO', ajudante1: 'LEANDRO DA HORA BATISTA', ajudante2: null,
  pesoKg: 2405, entPlanejado: 31, nfPlanejado: 36, qtdParadasReal: 31, kmPercorrido: 93.5,
  inicioViagem: '2026-07-15T05:07:00.000Z', fimViagem: '2026-07-15T14:08:00.000Z', status: 'ok',
}

describe('gerarKpiViagemXlsx', () => {
  it('gera uma aba única com cabeçalho de marca, header de tabela e as linhas', async () => {
    const buf = await gerarKpiViagemXlsx([linha])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)

    expect(wb.worksheets.map(ws => ws.name)).toEqual(['KPI Nutry Max'])
    const ws = wb.worksheets[0]
    expect(ws.getImages()).toHaveLength(1)
    expect(String(ws.getCell('A1').value)).toMatch(/KPI NUTRY MAX/i)

    // Linha 3 = header da tabela (linhas 1-2 = faixa de marca)
    expect(ws.getRow(3).values).toEqual([
      , 'CARGA', 'PLACA', 'DESTINO', 'MOTORISTA', 'PESO (KG)', 'CLIENTES PLANEJADOS',
      'PARADAS REAIS', 'KM PERCORRIDO', 'INÍCIO VIAGEM', 'FIM VIAGEM', 'STATUS',
    ])
    const linha4 = ws.getRow(4).values as unknown[]
    expect(linha4[1]).toBe('92593')
    expect(linha4[2]).toBe('TTL7D40')
    expect(linha4[8]).toBe(93.5)
    expect(linha4[11]).toBe('OK')
  })

  it('linha TOTAL soma peso e km', async () => {
    const buf = await gerarKpiViagemXlsx([linha, { ...linha, carga: '92594', pesoKg: 1000, kmPercorrido: 50 }])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]
    const totalRow = ws.getRow(6).values as unknown[]
    expect(totalRow[1]).toBe('TOTAL')
    expect(totalRow[5]).toBe(2405 + 1000)
    expect(totalRow[8]).toBe(93.5 + 50)
  })

  it('lista vazia gera só cabeçalho, sem TOTAL', async () => {
    const buf = await gerarKpiViagemXlsx([])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]
    expect(ws.rowCount).toBe(3)
  })
})
