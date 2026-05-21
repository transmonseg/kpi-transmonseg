import ExcelJS from 'exceljs'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'docs/ground-truth-dia-20'
const files = readdirSync(dir).filter(f => f.endsWith('.xlsx'))

for (const file of files) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(join(dir, file))
  console.log(`\n=== ${file} ===`)
  console.log(`Sheets: ${wb.worksheets.map(w => w.name).join(', ')}`)
  const ws = wb.worksheets[0]
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const row = ws.getRow(r)
    const cells = []
    for (let c = 1; c <= Math.min(10, row.cellCount); c++) {
      const v = row.getCell(c).value
      if (v != null && v !== '') cells.push(`[${c}]${String(v).slice(0, 50)}`)
    }
    if (cells.length) console.log(`  L${r}: ${cells.join(' | ')}`)
  }
}
