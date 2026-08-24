import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarKpiPortefrioXlsx, COLUNAS_KPI_PORTEFRIO } from './gerador-xlsx'
import type { LinhaKpiPortefrio } from './types'

const LINHA: LinhaKpiPortefrio = {
  placa: 'LUE5C42', ordemPlanejada: 1, ordemReal: 1, cliente: 'LOJA TESTE',
  endereco: 'RUA X, 10 - CENTRO, CIDADE X - RJ', visitado: true,
  horarioChegada: '2026-08-24T10:00:00-03:00', tempMin: -20, tempMax: -16, tempMedia: -18,
}

describe('gerarKpiPortefrioXlsx', () => {
  it('gera um XLSX valido com cabecalho e uma linha de dado', async () => {
    const buf = await gerarKpiPortefrioXlsx([LINHA], '2026-08-24')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.getWorksheet('KPI 2026-08-24')
    expect(ws).toBeDefined()
    const header = ws!.getRow(1).values as unknown[]
    expect(header.slice(1)).toEqual([...COLUNAS_KPI_PORTEFRIO])
    const linha = ws!.getRow(2).values as unknown[]
    expect(linha[1]).toBe('LUE5C42')
    expect(linha[2]).toBe(1)
  })

  it('cliente nao visitado mostra "Não" e campos de temperatura vazios', async () => {
    const naoVisitado: LinhaKpiPortefrio = { ...LINHA, visitado: false, horarioChegada: null, tempMin: null, tempMax: null, tempMedia: null }
    const buf = await gerarKpiPortefrioXlsx([naoVisitado], '2026-08-24')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.getWorksheet('KPI 2026-08-24')
    const linha = ws!.getRow(2).values as unknown[]
    expect(linha[6]).toBe('Não') // coluna Visitado
  })
})
