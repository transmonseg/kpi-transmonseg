import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'

const input = process.argv[2]
const buf = await readFile(input)
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(buf)

console.log(`\n=== M1 (col 13 row 1) por sheet — ${input} ===\n`)
wb.eachSheet((ws) => {
  const v = ws.getRow(1).getCell(13).value
  let display = v
  if (v instanceof Date) display = v.toISOString()
  else if (v && typeof v === 'object') display = JSON.stringify(v)
  console.log(`  ${ws.name.padEnd(25)} M1 = ${display}`)
})
