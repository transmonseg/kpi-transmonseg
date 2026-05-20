import ExcelJS from 'exceljs'
import { readFile } from 'fs/promises'

const BASE = 'C:\\Users\\media\\OneDrive\\EMPRESA TRIFORCE AUTO\\clientes\\tia-erica\\CONVERSAS COM ERICA\\'
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(await readFile(BASE + 'escalas\\ESCALA GERAL DE MAIO 1.xlsx'))

// Find aba 11
const ws = wb.worksheets.find(w => w.name.trim() === '11')
if (!ws) { console.log('Aba 11 não encontrada'); process.exit(1) }

console.log('=== Aba 11 — primeiras 20 linhas ===')
for (let r = 1; r <= 20; r++) {
  const row = ws.getRow(r)
  const vals = []
  for (let c = 1; c <= 12; c++) {
    const v = row.getCell(c).value
    if (v !== null && v !== undefined) {
      const s = typeof v === 'object' && v !== null
        ? ('text' in v ? v.text : 'richText' in v ? v.richText.map(x=>x.text).join('') : JSON.stringify(v).slice(0,30))
        : String(v).slice(0, 30)
      vals.push('[' + c + ']=' + JSON.stringify(s))
    }
  }
  console.log(`  row ${r}: ${vals.join(', ') || '(vazia)'}`)
}
