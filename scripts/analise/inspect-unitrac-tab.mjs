import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { argv } from 'node:process'

const file = argv[2]
const tab = argv[3]
if (!file || !tab) {
  console.error('uso: node inspect-unitrac-tab.mjs <arquivo> <aba>')
  process.exit(1)
}

const buf = readFileSync(file)
const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })
const ws = wb.Sheets[tab]
if (!ws) {
  console.error(`Aba "${tab}" não encontrada`)
  console.log('Disponíveis:', wb.SheetNames.slice(0, 30).join(', '))
  process.exit(1)
}

const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
console.log(`\n=== ABA "${tab}" — ${rows.length} linhas ===\n`)
for (let i = 0; i < rows.length; i++) {
  const r = rows[i]
  console.log(`r${String(i + 1).padStart(2, '0')}: ${JSON.stringify(r).slice(0, 320)}`)
}
