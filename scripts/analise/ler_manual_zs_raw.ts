import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'

const MAN = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI ZONA SUL-MANUAL.xlsx'
const wb = XLSX.read(readFileSync(MAN), { type: 'buffer' })
const ws = wb.Sheets['19']
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
console.log('Primeiras 8 linhas:')
for (let i = 0; i < 8; i++) {
  const r = rows[i]
  if (!r) continue
  console.log(`L${String(i).padStart(2,'0')}: ${r.map(c => String(c ?? '').slice(0, 18)).join(' | ')}`)
}
console.log('\nLinhas 9-20:')
for (let i = 9; i < 20; i++) {
  const r = rows[i]
  if (!r) continue
  console.log(`L${String(i).padStart(2,'0')}: ${r.map(c => String(c ?? '').slice(0, 18)).join(' | ')}`)
}
