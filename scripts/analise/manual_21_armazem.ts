import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'

const MANUAL = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI-ARMAZEM_GRAO-MANUAL.xlsx'

;(async () => {
  const wb = XLSX.read(readFileSync(MANUAL), { type: 'buffer' })
  const ws = wb.Sheets['21.05']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
  console.log('═══ MANUAL ARMAZEM 21.05 ═══')
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every(c => c == null || c === '')) continue
    console.log(`L${String(i).padStart(2,'0')}: ${r.map(c => String(c ?? '').slice(0,32)).join(' | ')}`)
  }
})()
