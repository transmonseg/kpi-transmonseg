// Renomeia uma sheet em um XLSX.
// Uso: node scripts/rename-sheet.mjs <input.xlsx> <output.xlsx> <fromName> <toName>

import ExcelJS from 'exceljs'
import { readFile, writeFile } from 'node:fs/promises'

const [, , input, output, fromName, toName] = process.argv
if (!input || !output || !fromName || !toName) {
  console.error('Uso: node rename-sheet.mjs <input.xlsx> <output.xlsx> <fromName> <toName>')
  process.exit(1)
}

const buf = await readFile(input)
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(buf)

const ws = wb.getWorksheet(fromName)
if (!ws) {
  console.error(`Sheet "${fromName}" não encontrada. Disponíveis:`)
  wb.eachSheet((s) => console.error(`  - ${s.name}`))
  process.exit(1)
}
ws.name = toName

const outBuf = await wb.xlsx.writeBuffer()
await writeFile(output, Buffer.from(outBuf))
console.log(`Renomeada "${fromName}" → "${toName}" e salvo em ${output}`)
