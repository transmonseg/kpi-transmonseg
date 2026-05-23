import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { argv } from 'node:process'

const file = argv[2]
if (!file) {
  console.error('uso: node summary-unitrac.mjs <arquivo>')
  process.exit(1)
}

const buf = readFileSync(file)
const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })

const normaliza = (p) => String(p ?? '').toUpperCase().replace(/[-\s]/g, '')

const lojas = new Map() // local -> count
const placasNormToOriginal = new Map()
let totalParadas = 0
let totalAbas = wb.SheetNames.length
let primeiraData = null
let ultimaData = null

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })

  // Placa está na r4 col 2 OU é o nome da aba
  const placaAba = name
  const placaR4 = rows[3]?.[1] ?? ''
  const placaNorm = normaliza(placaAba)
  placasNormToOriginal.set(placaNorm, placaAba)

  // Paradas começam em r7 (index 6)
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i]
    const dataEntrada = r[2]
    const local = String(r[10] ?? '').trim()
    if (!dataEntrada) continue
    totalParadas++
    if (local) {
      lojas.set(local, (lojas.get(local) ?? 0) + 1)
    }
    if (!primeiraData || dataEntrada < primeiraData) primeiraData = dataEntrada
    if (!ultimaData || dataEntrada > ultimaData) ultimaData = dataEntrada
  }
}

console.log(`\n=== RESUMO ${file} ===`)
console.log(`Abas (= placas): ${totalAbas}`)
console.log(`Total de paradas: ${totalParadas}`)
console.log(`Primeira data: ${primeiraData}`)
console.log(`Última data: ${ultimaData}`)

console.log(`\nPlacas únicas (normalizadas): ${placasNormToOriginal.size}`)

console.log(`\nTop 30 locais (por frequência):`)
const top = [...lojas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
for (const [local, qtd] of top) {
  console.log(`  ${String(qtd).padStart(4)} × ${local}`)
}

console.log(`\nExemplos de formato de placa nas abas:`)
const ex = [...placasNormToOriginal.values()].slice(0, 30)
for (const p of ex) console.log(`  "${p}" → "${normaliza(p)}"`)
