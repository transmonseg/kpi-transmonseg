// Desloca TODAS as datas de um XLSX em +N dias (mantém todo o resto intacto).
// Uso: node scripts/shift-escala-dates.mjs <input.xlsx> <output.xlsx> <days>

import ExcelJS from 'exceljs'
import { readFile, writeFile } from 'node:fs/promises'

function shiftIfDate(value, days) {
  if (value instanceof Date) {
    return new Date(value.getTime() + days * 86400 * 1000)
  }
  // Pode ser objeto com .result (fórmula calculada)
  if (value && typeof value === 'object' && 'result' in value && value.result instanceof Date) {
    return { ...value, result: new Date(value.result.getTime() + days * 86400 * 1000) }
  }
  return null
}

async function main() {
  const [, , input, output, daysStr] = process.argv
  if (!input || !output || !daysStr) {
    console.error('Uso: node shift-escala-dates.mjs <input.xlsx> <output.xlsx> <days>')
    process.exit(1)
  }
  const days = parseInt(daysStr, 10)
  if (isNaN(days)) {
    console.error('days deve ser inteiro')
    process.exit(1)
  }

  console.log(`Lendo ${input}…`)
  const buf = await readFile(input)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)

  let totalSheets = 0
  let totalDatesShifted = 0

  wb.eachSheet((ws) => {
    totalSheets++
    let sheetDates = 0
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const newValue = shiftIfDate(cell.value, days)
        if (newValue !== null) {
          cell.value = newValue
          sheetDates++
        }
      })
    })
    if (sheetDates > 0) {
      console.log(`  Aba "${ws.name}": ${sheetDates} datas deslocadas`)
    }
    totalDatesShifted += sheetDates
  })

  console.log(`\nTotal: ${totalSheets} sheets, ${totalDatesShifted} datas deslocadas em +${days} dia(s).`)

  console.log(`Escrevendo ${output}…`)
  const outBuf = await wb.xlsx.writeBuffer()
  await writeFile(output, Buffer.from(outBuf))
  console.log('Pronto!')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
