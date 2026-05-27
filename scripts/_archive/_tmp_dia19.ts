import ExcelJS from 'exceljs'
import { readdirSync } from 'fs'

const MAN_DIR = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/'

;(async () => {
  const files = readdirSync(MAN_DIR).filter(f => f.endsWith('.xlsx'))
  for (const f of files) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(MAN_DIR + f)
    const abas = wb.worksheets.map(w => w.name)
    const tem19 = abas.find(a => /^19/.test(a))
    console.log(`${tem19 ? '✓' : '✗'}  ${f.padEnd(35)} ${tem19 ? `aba "${tem19}"` : '— sem dia 19'}`)
  }
})()
