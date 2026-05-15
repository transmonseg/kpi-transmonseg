import ExcelJS from 'exceljs'
import { readFile } from 'fs/promises'

const BASE = 'C:\\Users\\media\\OneDrive\\EMPRESA TRIFORCE AUTO\\clientes\\tia-erica\\CONVERSAS COM ERICA\\'
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(await readFile(BASE + 'escalas\\ESCALA GERAL DE MAIO 1.xlsx'))

const ws = wb.worksheets.find(w => w.name.trim() === '11')

function cellStr(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(x=>x.text).join('')
    if ('text' in v) return v.text
    if ('result' in v) return String(v.result ?? v.formula ?? '?').slice(0, 20)
    if ('formula' in v) return `F:${v.formula?.slice(0,20)}`
    return JSON.stringify(v).slice(0,20)
  }
  return String(v).slice(0,40)
}

// Show rows 50-75: around Carrefour section
console.log('=== Rows 50-75 ===')
for (let r = 50; r <= 75; r++) {
  const row = ws.getRow(r)
  const c1 = cellStr(row.getCell(1).value)
  const c2 = cellStr(row.getCell(2).value)
  const c4 = cellStr(row.getCell(4).value)
  const c6 = cellStr(row.getCell(6).value)
  const c8 = cellStr(row.getCell(8).value)
  const c10 = cellStr(row.getCell(10).value)
  console.log(`  ${r}: [col4=${c4}] "${c1}" | peso=${c2} | motor=${c6} | placa=${c8} | motor2=${c10}`)
}
