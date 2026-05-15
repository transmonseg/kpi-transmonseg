// Inspeciona um XLSX de escala e lista todas as datas que aparecem nele.
// Uso: node scripts/inspect-escala-dates.mjs <input.xlsx>

import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'

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
        .replace(/xmlns:\w+="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml/g,
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml')
        .replace(/xmlns:\w+="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/extended-properties/g,
          'xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties')
      zip.file(entry.name, normalized)
      needsRebuild = true
    }
    if (!needsRebuild) return buf
    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  } catch {
    return buf
  }
}

async function main() {
  const [, , input] = process.argv
  if (!input) {
    console.error('Uso: node inspect-escala-dates.mjs <input.xlsx>')
    process.exit(1)
  }

  let buf = await readFile(input)
  // Tenta primeiro sem normalizar (a maioria dos XLSX não precisa)
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buf)
  } catch {
    // Se falhar, tenta com namespace normalization (caso Unitrac)
    buf = await normalizeXlsxNamespaces(buf)
    await wb.xlsx.load(buf)
  }

  console.log(`\n=== ${input} ===`)
  console.log(`Total de sheets: ${wb.worksheets.length}\n`)

  const datesSeen = new Set()
  const sheetSummary = []

  wb.eachSheet((ws) => {
    const sheetDates = new Set()
    let rowCount = 0
    let cellsScanned = 0

    // Varrer todas as células procurando datas
    ws.eachRow((row) => {
      rowCount++
      row.eachCell((cell) => {
        cellsScanned++
        let v = cell.value
        // Pode ser objeto {result: Date}
        if (v && typeof v === 'object' && 'result' in v) v = v.result
        if (v instanceof Date) {
          const iso = v.toISOString().slice(0, 10)
          datesSeen.add(iso)
          sheetDates.add(iso)
        } else if (typeof v === 'string') {
          // Tentar pegar datas em string formato DD/MM/YYYY ou DD-MM-YYYY
          const m = v.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)
          if (m) {
            const [, d, mo, y] = m
            const year = y.length === 2 ? '20' + y : y
            const iso = `${year}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`
            datesSeen.add(iso)
            sheetDates.add(iso)
          }
        }
      })
    })

    sheetSummary.push({
      name: ws.name,
      rows: rowCount,
      cells: cellsScanned,
      dates: [...sheetDates].sort(),
    })
  })

  // Resumo das primeiras 10 sheets
  console.log('Primeiras 10 sheets:')
  for (const s of sheetSummary.slice(0, 10)) {
    const datesStr = s.dates.length > 0
      ? s.dates.slice(0, 5).join(', ') + (s.dates.length > 5 ? `… (${s.dates.length} datas)` : '')
      : '(nenhuma data)'
    console.log(`  • ${s.name} | ${s.rows} linhas | datas: ${datesStr}`)
  }

  if (sheetSummary.length > 10) {
    console.log(`  ... (+${sheetSummary.length - 10} sheets)`)
  }

  console.log('\n=== Datas únicas no arquivo inteiro ===')
  const sortedDates = [...datesSeen].sort()
  console.log(`Total: ${sortedDates.length} datas distintas`)
  for (const d of sortedDates) {
    console.log(`  ${d}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
