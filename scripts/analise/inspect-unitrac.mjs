import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { argv } from 'node:process'

const file = argv[2]
if (!file) {
  console.error('uso: node inspect-unitrac.mjs <arquivo>')
  process.exit(1)
}

const buf = readFileSync(file)
const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })

console.log(`\n=== ARQUIVO: ${file}`)
console.log(`Abas: ${wb.SheetNames.join(', ')}`)

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name]
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1')
  console.log(`\n--- ABA "${name}" — range ${ws['!ref']} (${range.e.r + 1} linhas × ${range.e.c + 1} cols) ---`)

  // Mostrar primeiras 5 linhas como matriz
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
  console.log(`\nPrimeiras 5 linhas (header):`)
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    console.log(`  r${i + 1}: ${JSON.stringify(rows[i]).slice(0, 300)}`)
  }

  console.log(`\nObjetos (sheet_to_json):`)
  const objs = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
  console.log(`  total: ${objs.length}`)
  if (objs.length > 0) {
    console.log(`  primeiro objeto:`)
    const first = objs[0]
    for (const k of Object.keys(first)) {
      console.log(`    "${k}" → ${JSON.stringify(first[k])}`)
    }
  }
}
