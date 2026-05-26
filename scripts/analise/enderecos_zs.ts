import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'

const MAN = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI ZONA SUL-MANUAL.xlsx'
const wb = XLSX.read(readFileSync(MAN), { type: 'buffer' })
const ws = wb.Sheets['endereço filiais']
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
console.log(`Total: ${rows.length}\n`)
for (let i = 0; i < rows.length; i++) {
  const r = rows[i]
  if (!r || r.every(c => c == null || c === '')) continue
  console.log(`L${String(i).padStart(2,'0')}: ${r.map(c => String(c ?? '').slice(0, 40)).join(' | ')}`)
}
