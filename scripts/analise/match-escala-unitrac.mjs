import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { argv } from 'node:process'

const escalaFile = argv[2]
const escalaAba = argv[3]
const unitracFile = argv[4]
if (!escalaFile || !escalaAba || !unitracFile) {
  console.error('uso: node match-escala-unitrac.mjs <escala.xlsx> <aba> <unitrac.xlsx>')
  process.exit(1)
}

const norm = (p) => String(p ?? '').toUpperCase().replace(/[-\s]/g, '')
const placaRe = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/

// 1) Carregar placas da escala
const wbE = new ExcelJS.Workbook()
await wbE.xlsx.readFile(escalaFile)
const ws = wbE.getWorksheet(escalaAba)
const cellText = (v) => {
  if (v == null) return ''
  if (typeof v === 'object' && 'text' in v) return String(v.text)
  if (typeof v === 'object' && 'result' in v) return String(v.result)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v)
}

const escalaItems = [] // { row, loja, motorista, placaRaw, placaNorm }
for (let r = 1; r <= ws.rowCount; r++) {
  const row = ws.getRow(r)
  const loja = cellText(row.getCell(1).value).trim()
  const motorista = cellText(row.getCell(6).value).trim()
  const placa1 = cellText(row.getCell(8).value).trim()
  const placa2 = cellText(row.getCell(12).value).trim()

  for (const placa of [placa1, placa2]) {
    if (!placa) continue
    const n = norm(placa)
    if (placaRe.test(n)) {
      escalaItems.push({ row: r, loja, motorista, placaRaw: placa, placaNorm: n })
    }
  }
}

// 2) Carregar placas do unitrac (nomes das abas)
const bufU = readFileSync(unitracFile)
const wbU = XLSX.read(bufU, { type: 'buffer' })
const unitracPlacas = new Set(wbU.SheetNames.map(norm))

// 3) Comparar
const placasEscala = new Set(escalaItems.map(x => x.placaNorm))
const semMatch = []
const comMatch = []
for (const e of escalaItems) {
  if (unitracPlacas.has(e.placaNorm)) comMatch.push(e)
  else semMatch.push(e)
}

const placasUnitracExtra = [...unitracPlacas].filter(p => !placasEscala.has(p))

console.log(`\n=== CRUZAMENTO ESCALA × UNITRAC ===`)
console.log(`Escala: ${escalaItems.length} entradas com placa (placas únicas: ${placasEscala.size})`)
console.log(`Unitrac: ${unitracPlacas.size} placas com tracking`)
console.log(`\nMATCH (escala → unitrac): ${comMatch.length} entradas`)
console.log(`SEM MATCH (escala não tem tracking): ${semMatch.length} entradas`)
console.log(`Placas no unitrac SEM aparecer na escala: ${placasUnitracExtra.length}`)

console.log(`\n--- ENTRADAS SEM MATCH (escala → não rastreada): ---`)
for (const e of semMatch) {
  console.log(`  r${String(e.row).padStart(3)}: ${e.placaNorm.padEnd(8)} | ${e.motorista.slice(0, 20).padEnd(20)} | ${e.loja}`)
}

console.log(`\n--- PLACAS NO UNITRAC SEM APARECER NA ESCALA (primeiras 50): ---`)
for (const p of placasUnitracExtra.slice(0, 50)) {
  console.log(`  ${p}`)
}

console.log(`\nTaxa de match: ${((comMatch.length / escalaItems.length) * 100).toFixed(1)}%`)
console.log(`Placas únicas da escala que batem: ${[...placasEscala].filter(p => unitracPlacas.has(p)).length} / ${placasEscala.size}`)
