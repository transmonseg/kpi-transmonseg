import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'

const MANUAL = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/KPIS MANUAIS/KPI ARMAZEM DO GRAO.xlsx'

;(async () => {
  const wb = XLSX.read(readFileSync(MANUAL), { type: 'buffer' })
  console.log('═══ ABA ENDEREÇOS ═══')
  const ws = wb.Sheets['ENDEREÇOS']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every(c => c == null || c === '')) continue
    console.log(`L${String(i).padStart(2,'0')}: ${r.map(c => String(c ?? '').slice(0,80)).join(' | ')}`)
  }
  console.log('\n═══ ABA matriz ═══')
  const ws2 = wb.Sheets['matriz']
  const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, raw: false }) as any[][]
  for (let i = 0; i < Math.min(40, rows2.length); i++) {
    const r = rows2[i]
    if (!r || r.every(c => c == null || c === '')) continue
    console.log(`L${String(i).padStart(2,'0')}: ${r.map(c => String(c ?? '').slice(0,80)).join(' | ')}`)
  }
})()
