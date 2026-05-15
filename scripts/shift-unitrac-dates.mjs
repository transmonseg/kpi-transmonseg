// Cria cópia do relatório Unitrac com datas deslocadas em +N dias.
// Uso: node scripts/shift-unitrac-dates.mjs <input.xlsx> <output.xlsx> <days>
//
// Ex: node scripts/shift-unitrac-dates.mjs \
//   "C:/Users/media/OneDrive/.../relatorio_unitrac_9086.xlsx" \
//   "C:/Users/media/OneDrive/.../relatorio_unitrac_9086_DIA14.xlsx" \
//   3
//
// Lê o XLSX (com normalização de namespace), soma N dias em todas as células
// de data (chegada, saída, início/fim de viagem) de cada sheet, e salva uma
// nova cópia.

import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { readFile, writeFile } from 'node:fs/promises'

async function normalizeXlsxNamespaces(buf) {
  try {
    const zip = new JSZip()
    await zip.loadAsync(buf)
    let needsRebuild = false
    const xmlEntries = zip.file(/\.xml$/)
    for (const entry of xmlEntries) {
      const xml = await entry.async('string')
      if (!/<\w+:\w/.test(xml)) continue
      const normalized = xml
        .replace(/(<\/?)(\w+):(\w)/g, '$1$3')
        .replace(
          /xmlns:\w+="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml/g,
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml'
        )
        .replace(
          /xmlns:\w+="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/extended-properties/g,
          'xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties'
        )
      zip.file(entry.name, normalized)
      needsRebuild = true
    }
    if (!needsRebuild) return buf
    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  } catch {
    return buf
  }
}

function shiftDate(value, days) {
  if (value instanceof Date) {
    const shifted = new Date(value.getTime() + days * 86400 * 1000)
    return shifted
  }
  return null
}

async function main() {
  const [, , input, output, daysStr] = process.argv
  if (!input || !output || !daysStr) {
    console.error('Uso: node shift-unitrac-dates.mjs <input.xlsx> <output.xlsx> <days>')
    process.exit(1)
  }
  const days = parseInt(daysStr, 10)
  if (isNaN(days)) {
    console.error('days deve ser inteiro (ex: 3)')
    process.exit(1)
  }

  console.log(`Lendo ${input}…`)
  let buf = await readFile(input)
  buf = await normalizeXlsxNamespaces(buf)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)

  let totalSheets = 0
  let totalDatesShifted = 0

  wb.eachSheet((ws) => {
    totalSheets++
    // Linha 5: início/fim viagem (col 3 e 4)
    const row5 = ws.getRow(5)
    for (const col of [3, 4]) {
      const cell = row5.getCell(col)
      const newDate = shiftDate(cell.value, days)
      if (newDate) {
        cell.value = newDate
        totalDatesShifted++
      }
    }
    // A partir da linha 7: chegada (col 3) e saída (col 4) de cada parada
    let rowNum = 7
    while (true) {
      const row = ws.getRow(rowNum)
      const col2 = row.getCell(2).value
      if (col2 === null || col2 === undefined) break
      for (const col of [3, 4]) {
        const cell = row.getCell(col)
        const newDate = shiftDate(cell.value, days)
        if (newDate) {
          cell.value = newDate
          totalDatesShifted++
        }
      }
      rowNum++
    }
  })

  console.log(`Processadas ${totalSheets} abas, ${totalDatesShifted} datas deslocadas em +${days} dias.`)

  console.log(`Escrevendo ${output}…`)
  const outBuf = await wb.xlsx.writeBuffer()
  await writeFile(output, Buffer.from(outBuf))
  console.log('Pronto!')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
