import { describe, it, expect } from 'vitest'
import { readSheetRows, excelSerialToDate } from './excel-sheetjs'
import * as XLSX from 'xlsx'

function makeBuffer(rows: Record<string, unknown>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

describe('readSheetRows', () => {
  it('le linhas de um xlsx', () => {
    const buf = makeBuffer([{ Placa: 'ABC1D23', Loja: 'Assai' }])
    const rows = readSheetRows(buf, 'Sheet1')
    expect(rows).toHaveLength(1)
    expect(rows[0]['Placa']).toBe('ABC1D23')
  })

  it('retorna [] para planilha vazia', () => {
    expect(readSheetRows(makeBuffer([]), 'Sheet1')).toHaveLength(0)
  })

  it('usa primeira aba quando nome nao especificado', () => {
    expect(readSheetRows(makeBuffer([{ col: 'val' }]))).toHaveLength(1)
  })
})

describe('excelSerialToDate', () => {
  it('converte serial 45795 para maio/2025', () => {
    const d = excelSerialToDate(45795)
    expect(d.getUTCFullYear()).toBe(2025)
    expect(d.getUTCMonth()).toBe(4)  // maio = índice 4
    expect(d.getUTCDate()).toBe(18)
  })
})
