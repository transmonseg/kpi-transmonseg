import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'

const MANUAL = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/KPIS MANUAIS/KPI ARMAZEM DO GRAO.xlsx'

;(async () => {
  const wb = XLSX.read(readFileSync(MANUAL), { type: 'buffer' })
  console.log('Abas:', wb.SheetNames)
  console.log('---')
  // Lê cada aba e mostra resumo + endereços
  for (const aba of wb.SheetNames) {
    console.log(`\n═══ ABA: ${aba} ═══`)
    const ws = wb.Sheets[aba]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
    // Mostra primeiras 50 linhas e qualquer linha contendo "ENDERECO/ENDEREÇO/RUA/AV"
    for (let i = 0; i < Math.min(50, rows.length); i++) {
      const r = rows[i]
      if (!r || r.every(c => c == null || c === '')) continue
      console.log(`  L${i}: ${r.map(c => String(c ?? '').slice(0,30)).join(' | ')}`)
    }
  }
})()
