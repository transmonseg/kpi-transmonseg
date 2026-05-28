import ExcelJS from 'exceljs'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/'
const ARQS = [
  'KPI-SUPERPRIX-MANUAL.xlsx',
  'KPI ZONA SUL-MANUAL.xlsx',
  'KPI-ARMAZEM_GRAO-MANUAL.xlsx',
]

async function main() {
  for (const arq of ARQS) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(BASE + arq)
    console.log(`\n=== ${arq} ===`)
    for (const ws of wb.worksheets) {
      console.log(`  aba "${ws.name}"  rows=${ws.rowCount}  cols=${ws.columnCount}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
