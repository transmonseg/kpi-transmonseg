import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'

const buf = await readFile('C:/Users/media/Downloads/dia 19/ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx')
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
console.log('Abas:', wb.worksheets.map(w => w.name).join(', '))

const aba19 = wb.getWorksheet('19')
if (aba19) {
  console.log(`\nAba 19: ${aba19.rowCount} rows × ${aba19.columnCount} cols`)
  const maxRows = Math.min(8, aba19.rowCount)
  for (let r = 1; r <= maxRows; r++) {
    const row = aba19.getRow(r)
    const vals = []
    for (let c = 1; c <= Math.min(15, aba19.columnCount); c++) {
      const v = row.getCell(c).value
      vals.push(v === null || v === undefined || v === '' ? '·' : String(v).slice(0, 18))
    }
    console.log(`R${String(r).padStart(2)}:`, vals.join(' | '))
  }
}
