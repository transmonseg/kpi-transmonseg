// Sobrescreve a célula M1 de uma sheet específica com a data alvo.
// Útil pra preparar arquivo de teste sem mexer no resto.
// Uso: node scripts/set-sheet-date.mjs <input.xlsx> <output.xlsx> <sheetName> <YYYY-MM-DD>

import ExcelJS from 'exceljs'
import { readFile, writeFile } from 'node:fs/promises'

const [, , input, output, sheetName, dateStr] = process.argv
if (!input || !output || !sheetName || !dateStr) {
  console.error('Uso: node set-sheet-date.mjs <input.xlsx> <output.xlsx> <sheetName> <YYYY-MM-DD>')
  process.exit(1)
}

const [y, m, d] = dateStr.split('-').map(Number)
const targetDate = new Date(Date.UTC(y, m - 1, d))

const buf = await readFile(input)
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(buf)

const ws = wb.getWorksheet(sheetName)
if (!ws) {
  console.error(`Sheet "${sheetName}" não encontrada. Sheets disponíveis:`)
  wb.eachSheet((s) => console.error(`  - ${s.name}`))
  process.exit(1)
}

const m1 = ws.getRow(1).getCell(13)
console.log(`Antes:  M1 = ${m1.value}`)
m1.value = targetDate
console.log(`Depois: M1 = ${m1.value}`)

const outBuf = await wb.xlsx.writeBuffer()
await writeFile(output, Buffer.from(outBuf))
console.log(`Salvo em ${output}`)
