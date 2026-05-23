import ExcelJS from 'exceljs'
import { argv } from 'node:process'

const file = argv[2]
const sheetName = argv[3]
const startRow = Number(argv[4] ?? 1)
const endRow = Number(argv[5] ?? 100)
if (!file || !sheetName) {
  console.error('uso: node inspect-xlsx-range.mjs <arquivo> <aba> [startRow] [endRow]')
  process.exit(1)
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const ws = wb.getWorksheet(sheetName)
if (!ws) {
  console.error(`Aba "${sheetName}" não encontrada`)
  process.exit(1)
}

console.log(`\n--- ABA "${ws.name}" rows ${startRow}..${endRow} ---`)
for (let r = startRow; r <= Math.min(endRow, ws.rowCount); r++) {
  const row = ws.getRow(r)
  const cells = []
  for (let c = 1; c <= 13; c++) {
    const v = row.getCell(c).value
    let s
    if (v == null) s = ''
    else if (typeof v === 'object' && 'text' in v) s = String(v.text)
    else if (typeof v === 'object' && 'result' in v) s = String(v.result)
    else if (v instanceof Date) s = v.toISOString().slice(0, 10)
    else s = String(v)
    cells.push(s.slice(0, 25).padEnd(12))
  }
  console.log(`  r${String(r).padStart(3, '0')}: ${cells.join(' | ')}`)
}
