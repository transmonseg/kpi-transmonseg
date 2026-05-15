import ExcelJS from 'exceljs'
import { readFile } from 'fs/promises'

const BASE = 'C:\\Users\\media\\OneDrive\\EMPRESA TRIFORCE AUTO\\clientes\\tia-erica\\CONVERSAS COM ERICA\\'
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(await readFile(BASE + 'escalas\\ESCALA GERAL DE MAIO 1.xlsx'))

const ws = wb.worksheets.find(w => w.name.trim() === '11')

// Show rows 215-260 to see if Sendas / BENASSI area has separators
console.log('=== Rows 215-260 ===')
for (let r = 215; r <= 260; r++) {
  const row = ws.getRow(r)
  const v1 = row.getCell(1).value
  const v2 = row.getCell(2).value
  const v4 = row.getCell(4).value
  if (!v1) continue
  const s1 = typeof v1 === 'object' ? (v1.richText?.map(x=>x.text).join('') ?? v1.text ?? v1.result ?? JSON.stringify(v1).slice(0,40)) : String(v1).slice(0,60)
  const s4 = v4 ? (typeof v4 === 'object' ? JSON.stringify(v4).slice(0,20) : String(v4).slice(0,15)) : 'null'
  console.log(`  row ${r}: [${s4}] "${s1}"`)
}

// Show last 20 rows
console.log('\n=== Last 20 rows ===')
let lastRow = 0
ws.eachRow((row, r) => { lastRow = r })
for (let r = lastRow - 20; r <= lastRow; r++) {
  const row = ws.getRow(r)
  const v1 = row.getCell(1).value
  const v4 = row.getCell(4).value
  if (!v1) continue
  const s1 = typeof v1 === 'object' ? (v1.richText?.map(x=>x.text).join('') ?? v1.text ?? v1.result ?? JSON.stringify(v1).slice(0,40)) : String(v1).slice(0,60)
  const s4 = v4 ? (typeof v4 === 'object' ? JSON.stringify(v4).slice(0,20) : String(v4).slice(0,15)) : 'null'
  console.log(`  row ${r}: [${s4}] "${s1}"`)
}
