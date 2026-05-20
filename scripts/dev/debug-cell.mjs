import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'

const buf = await readFile('C:/Users/media/Downloads/DIA 19 KPI TESTE/KPI-ARMAZEM_GRAO-2026-05-19.xlsx')
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const ws = wb.worksheets[0]

// Linha 5 = primeira loja (ARMAZEM DO GRAO (CORREAS) baseado nos diffs)
for (let r = 5; r <= 8; r++) {
  const row = ws.getRow(r)
  console.log(`\nRow ${r}: ${row.getCell(1).value}`)
  for (let c = 5; c <= 7; c++) {
    const cell = row.getCell(c)
    console.log(`  Col ${c}: value=${JSON.stringify(cell.value)} type=${typeof cell.value} numFmt=${cell.numFmt}`)
    if (cell.value instanceof Date) {
      const d = cell.value
      console.log(`    getHours=${d.getHours()} getUTCHours=${d.getUTCHours()} getTimezoneOffset=${d.getTimezoneOffset()}`)
      console.log(`    ISO=${d.toISOString()} local=${d.toString()}`)
    }
  }
}
