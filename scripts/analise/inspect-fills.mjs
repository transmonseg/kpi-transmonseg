import ExcelJS from 'exceljs'
import { argv } from 'node:process'

const file = argv[2]
const sheetName = argv[3]
if (!file || !sheetName) {
  console.error('uso: node inspect-fills.mjs <arquivo> <aba>')
  process.exit(1)
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const ws = wb.getWorksheet(sheetName)

const cellText = (v) => {
  if (v == null) return ''
  if (typeof v === 'object' && 'text' in v) return String(v.text)
  if (typeof v === 'object' && 'result' in v) return String(v.result)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v)
}

// Coletar todas as cores únicas usadas em col A
const colorsByRow = new Map()
for (let r = 1; r <= Math.min(ws.rowCount, 250); r++) {
  const cell = ws.getRow(r).getCell(1)
  const fill = cell.fill
  let color = null
  if (fill && fill.type === 'pattern' && fill.fgColor) {
    color = fill.fgColor.argb || fill.fgColor.theme || JSON.stringify(fill.fgColor)
  }
  const text = cellText(cell.value).trim()
  colorsByRow.set(r, { color, text: text.slice(0, 60) })
}

// Listar todas cores distintas
const distinct = new Map()
for (const [r, { color, text }] of colorsByRow) {
  if (!color) continue
  if (!distinct.has(color)) distinct.set(color, [])
  distinct.get(color).push({ r, text })
}

console.log(`\n=== CORES USADAS EM COL A — aba "${sheetName}" ===\n`)
for (const [color, rows] of distinct) {
  console.log(`\n--- COR: ${color} — ${rows.length} linhas ---`)
  for (const x of rows.slice(0, 25)) {
    console.log(`  r${String(x.r).padStart(3, '0')}: ${x.text}`)
  }
  if (rows.length > 25) console.log(`  ... +${rows.length - 25} linhas`)
}

console.log(`\n=== Linhas sem cor (sem fill) ===`)
const noColor = [...colorsByRow.entries()].filter(([, x]) => !x.color)
console.log(`  total: ${noColor.length}`)
