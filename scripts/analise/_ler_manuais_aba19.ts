import ExcelJS from 'exceljs'
import { writeFileSync } from 'fs'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/'
const ARQS = [
  ['ARMAZEM_GRAO', 'KPI-ARMAZEM_GRAO-MANUAL.xlsx'],
  ['ASSAI', 'KPI-ASSAI-MANUAL.xlsx'],
  ['ATACADAO', 'KPI-ATACADAO-MANUAL.xlsx'],
  ['CARREFOUR', 'KPI-CARREFOUR-MANUAL.xlsx'],
  ['GUANABARA', 'KPI-GUANABARA-MANUAL.xlsx'],
  ['PREZUNIC', 'KPI-PREZUNIC-MANUAL.xlsx'],
  ['PRINCESA', 'KPI-PRINCESA-MANUAL.xlsx'],
  ['SUPERPRIX', 'KPI-SUPERPRIX-MANUAL.xlsx'],
  ['ZONA_SUL', 'KPI ZONA SUL-MANUAL.xlsx'],
]

const fmt = (v: unknown) => {
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
}

async function main() {
  const out: string[] = []
  for (const [rede, arq] of ARQS) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(BASE + arq)
    const ws = wb.worksheets.find(w => w.name === '19')
    if (!ws) continue
    out.push(`\n## ${rede} (aba 19)\n`)
    out.push(`| Loja | Mot | Placa | SaiCD | CHD | SaiLj |`)
    out.push(`|------|-----|-------|-------|-----|-------|`)
    for (let r = 4; r <= Math.min(ws.rowCount, 50); r++) {
      const cells: string[] = []
      for (let c = 1; c <= 11; c++) cells.push(fmt(ws.getCell(r, c).value))
      // Layout varia. Pega valores não-vazios.
      const valores = cells.filter(x => x.length > 0)
      if (valores.length === 0) continue
      out.push(`| ${cells.slice(0, 7).join(' | ')} |`)
    }
  }
  writeFileSync('scripts/analise/_manuais_aba19.md', out.join('\n'))
  console.log('OK scripts/analise/_manuais_aba19.md')
}
main().catch(e => { console.error(e); process.exit(1) })
