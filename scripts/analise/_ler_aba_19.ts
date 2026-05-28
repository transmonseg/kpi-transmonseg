import ExcelJS from 'exceljs'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/'
const ARQS = [
  ['SUPERPRIX', 'KPI-SUPERPRIX-MANUAL.xlsx'],
  ['ZONA_SUL', 'KPI ZONA SUL-MANUAL.xlsx'],
  ['ARMAZEM_GRAO', 'KPI-ARMAZEM_GRAO-MANUAL.xlsx'],
]

const fmt = (v: unknown) => {
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`
  return String(v ?? '').slice(0, 35)
}

async function main() {
  for (const [rede, arq] of ARQS) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(BASE + arq)
    const ws = wb.worksheets.find(w => w.name === '19')
    if (!ws) { console.log(`\n=== ${rede} ===\nNão tem aba "19"`); continue }
    console.log(`\n=== ${rede} aba "19" ===`)
    for (let r = 1; r <= Math.min(ws.rowCount, 25); r++) {
      const cells: string[] = []
      for (let c = 1; c <= 14; c++) {
        const v = ws.getCell(r, c).value
        cells.push(fmt(v).padEnd(c < 4 ? 25 : 8))
      }
      const line = cells.join('|').replace(/\s+\|/g, ' |')
      if (line.trim().replace(/\|/g, '').length === 0) continue
      console.log(`r${String(r).padStart(2,'0')}: ${line}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
