import ExcelJS from 'exceljs'
import { argv } from 'node:process'

const file = argv[2]
const sheetName = argv[3]
if (!file || !sheetName) {
  console.error('uso: node analyze-escala-aba.mjs <arquivo> <aba>')
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

// 1) Detectar separadores (linhas mescladas A:L com texto repetido)
const merges = ws.model.merges ?? []
const sepRows = new Set()
for (const m of merges) {
  // match A1:L1 padrão (mesma linha, começa em A)
  const match = m.match(/^A(\d+):([A-Z]+)\1$/)
  if (match) {
    const r = Number(match[1])
    const endCol = match[2]
    if (endCol.length > 0 && endCol !== 'A') sepRows.add(r)
  }
}

// 2) Encontrar todas as linhas com placa válida na coluna H (col 8) ou L (col 12)
const placaRe = /^[A-Z]{3}[-]?\d[A-Z0-9]\d{2}$/i
const rows = []
const sectionsByRow = new Map() // r -> rede atual
let currentSection = 'INICIO'

for (let r = 1; r <= ws.rowCount; r++) {
  const row = ws.getRow(r)
  const colA = cellText(row.getCell(1).value).trim()
  const colH = cellText(row.getCell(8).value).trim()
  const colF = cellText(row.getCell(6).value).trim()

  // Detectar separador
  if (sepRows.has(r)) {
    if (colA && !colA.includes('CARREGAMENTO') && !colA.includes('TOTAL')) {
      currentSection = colA.slice(0, 40)
    }
    rows.push({ r, tipo: 'SEPARADOR', section: currentSection, colA })
    continue
  }

  // Detectar header (REDES/FILIAIS na coluna A)
  if (colA.includes('REDES') && colA.includes('FILIA')) {
    rows.push({ r, tipo: 'HEADER', section: currentSection, colA })
    continue
  }

  // Detectar linha de dados com placa
  if (colH && placaRe.test(colH.replace(/\s/g, ''))) {
    rows.push({
      r,
      tipo: 'DADOS',
      section: currentSection,
      loja: colA.slice(0, 50),
      motorista: colF,
      placa: colH.replace(/\s/g, ''),
    })
    continue
  }

  // Detectar linha "secundária" (sem QTD mas com placa = continuação)
  if (colA && colA.length > 0 && !colA.includes('CARREGAMENTO') && !colA.includes('TOTAL') && !colA.includes('RESUMO')) {
    // linha com nome de loja mas sem placa
    if (colA.length > 5) {
      rows.push({ r, tipo: 'LOJA_SEM_PLACA', section: currentSection, colA, motorista: colF, placa: colH })
    }
  }
}

console.log(`\n=== ANÁLISE ABA "${sheetName}" ===`)
console.log(`merges totais: ${merges.length}`)
console.log(`linhas separadoras (mescladas começando em A): ${sepRows.size}`)
console.log(`\nSeparadores encontrados:`)
for (const sep of rows.filter(x => x.tipo === 'SEPARADOR')) {
  console.log(`  r${String(sep.r).padStart(3, '0')}: "${sep.colA.slice(0, 50)}"`)
}

console.log(`\n=== Contagem por seção ===`)
const bySection = new Map()
for (const r of rows.filter(x => x.tipo === 'DADOS')) {
  if (!bySection.has(r.section)) bySection.set(r.section, [])
  bySection.get(r.section).push(r)
}
for (const [section, lojas] of bySection) {
  console.log(`\n[${section}] — ${lojas.length} linhas com placa`)
  for (const l of lojas) {
    console.log(`  r${String(l.r).padStart(3, '0')}: ${l.placa.padEnd(10)} | ${l.motorista.padEnd(20)} | ${l.loja}`)
  }
}

console.log(`\n=== Linhas com loja mas SEM placa ===`)
for (const l of rows.filter(x => x.tipo === 'LOJA_SEM_PLACA').slice(0, 30)) {
  console.log(`  r${String(l.r).padStart(3, '0')} [${l.section}]: ${l.colA.slice(0, 45)} | placa=${l.placa.slice(0, 10)}`)
}
