import ExcelJS from 'exceljs'
import { readFile } from 'fs/promises'

const BASE = 'C:\\Users\\media\\OneDrive\\EMPRESA TRIFORCE AUTO\\clientes\\tia-erica\\CONVERSAS COM ERICA\\'
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(await readFile(BASE + 'escalas\\ESCALA GERAL DE MAIO 1.xlsx'))

const ws = wb.worksheets.find(w => w.name.trim() === '11')

// Find separator-looking rows: col1 has text, col4 is null/empty
console.log('=== Potenciais separadores (col4 vazia) na aba 11 ===')
let count = 0
ws.eachRow((row, r) => {
  if (r <= 4) return
  const v1 = row.getCell(1).value
  const v4 = row.getCell(4).value
  const s1 = v1 ? (typeof v1 === 'object' ? JSON.stringify(v1).slice(0,40) : String(v1).slice(0,60)) : null
  const s4 = v4 ? (typeof v4 === 'object' ? JSON.stringify(v4).slice(0,20) : String(v4).slice(0,30)) : null
  if (s1 && !s4) {
    console.log(`  row ${r}: col1="${s1}", col4=null`)
    count++
    if (count > 30) { console.log('  ... truncated'); return }
  }
})
console.log(`Total: ${count}`)

// Also check total rows
let lastRow = 0
ws.eachRow((row, r) => { lastRow = r })
console.log(`\nTotal rows: ${lastRow}`)
