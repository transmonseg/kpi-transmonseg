import ExcelJS from 'exceljs'
import { argv } from 'node:process'

const file = argv[2]
const sheetFilter = argv[3]
if (!file) {
  console.error('uso: node inspect-xlsx.mjs <arquivo.xlsx> [aba]')
  process.exit(1)
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)

console.log(`\n=== ARQUIVO: ${file}`)
console.log(`Abas (${wb.worksheets.length}):`)
for (const ws of wb.worksheets) {
  console.log(`  - "${ws.name}" | rows=${ws.rowCount} cols=${ws.columnCount}`)
}

for (const ws of wb.worksheets) {
  if (sheetFilter && ws.name !== sheetFilter) continue
  console.log(`\n--- ABA "${ws.name}" ---`)
  console.log(`rowCount=${ws.rowCount} columnCount=${ws.columnCount}`)

  const merges = ws.model.merges ?? []
  console.log(`merges=${merges.length}`)
  if (merges.length) {
    console.log('  primeiros 10 merges:', merges.slice(0, 10))
  }

  const maxRows = Math.min(ws.rowCount, 80)
  console.log(`\nprimeiras ${maxRows} linhas:`)
  for (let r = 1; r <= maxRows; r++) {
    const row = ws.getRow(r)
    const cells = []
    for (let c = 1; c <= Math.min(ws.columnCount, 15); c++) {
      const v = row.getCell(c).value
      let s
      if (v == null) s = ''
      else if (typeof v === 'object' && 'text' in v) s = String(v.text)
      else if (typeof v === 'object' && 'result' in v) s = String(v.result)
      else if (v instanceof Date) s = v.toISOString().slice(0, 10)
      else s = String(v)
      cells.push(s.slice(0, 30).padEnd(15))
    }
    console.log(`  r${String(r).padStart(3, '0')}: ${cells.join(' | ')}`)
  }
}
