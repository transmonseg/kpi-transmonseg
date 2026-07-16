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
    const buf = await gerarKpiViagemXlsx([linha], '2026-07-15')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)

    expect(wb.worksheets.map(ws => ws.name)).toEqual(['15.07'])
    const ws = wb.worksheets[0]
    expect(ws.getImages()).toHaveLength(1)
    expect(String(ws.getCell('A1').value)).toMatch(/RELATÓRIO KPI - NUTRY MAX/i)
    expect(String(ws.getCell('A2').value)).toMatch(/Quarta-feira, 15 de Julho de 2026/)

    // Linha 3 = header da tabela (linhas 1-2 = faixa de marca)
    expect(ws.getRow(3).values).toEqual([
      , 'CARGA', 'PLACA', 'DESTINO', 'MOTORISTA', 'AJUDANTE 1', 'AJUDANTE 2', 'PESO (KG)',
      'CLIENTES PLANEJADOS', 'NF PLANEJADO', 'PARADAS REAIS', 'KM PERCORRIDO',
      'INÍCIO VIAGEM', 'FIM VIAGEM', 'STATUS',
    ])
    const linha4 = ws.getRow(4).values as unknown[]
    expect(linha4[1]).toBe('92593')
    expect(linha4[2]).toBe('TTL7D40')
    expect(linha4[5]).toBe('LEANDRO DA HORA BATISTA')
    expect(linha4[6]).toBe('')
    expect(linha4[9]).toBe(36)
    expect(linha4[11]).toBe(93.5)
    // Hora real do Excel (não texto) — ExcelJS devolve como Date na época
    // 1899-12-30, igual ao arquivo real do Benassi (mesma convenção do formato).
    expect((linha4[12] as Date).getUTCHours()).toBe(5)
    expect((linha4[12] as Date).getUTCMinutes()).toBe(7)
    expect((linha4[13] as Date).getUTCHours()).toBe(14)
    expect((linha4[13] as Date).getUTCMinutes()).toBe(8)
    expect(ws.getRow(4).getCell(12).numFmt).toBe('h:mm')
    expect(ws.getRow(4).getCell(13).numFmt).toBe('h:mm')
    expect(linha4[14]).toBe('OK')
  })

  it('linha TOTAL soma peso e km', async () => {
    const buf = await gerarKpiViagemXlsx([linha, { ...linha, carga: '92594', pesoKg: 1000, kmPercorrido: 50 }], '2026-07-15')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]
    const totalRow = ws.getRow(6).values as unknown[]
    expect(totalRow[1]).toBe('TOTAL')
    expect(totalRow[7]).toBe(2405 + 1000)
    expect(totalRow[11]).toBe(93.5 + 50)
  })

  it('lista vazia gera só cabeçalho, sem TOTAL', async () => {
    const buf = await gerarKpiViagemXlsx([], '2026-07-15')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]
    expect(ws.rowCount).toBe(3)
  })
})
