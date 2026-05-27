import ExcelJS from 'exceljs'
import { readdirSync } from 'fs'

const MAN_DIR = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/'

;(async () => {
  const files = readdirSync(MAN_DIR).filter(f => f.endsWith('.xlsx'))
  for (const f of files) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(MAN_DIR + f)
    const abas = wb.worksheets.map(w => `${w.name}(${w.rowCount}r)`).join(', ')
    console.log(`${f.padEnd(40)} → ${abas}`)
  }
})()
