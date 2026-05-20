import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { parseEscalaArmazemGrao } from '../../src/lib/parsers/escala-armazem-grao.ts'

const buf = await readFile('C:/Users/media/Downloads/dia 19/ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx')

const wb = new ExcelJS.Workbook()
await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
console.log('Abas:', wb.worksheets.map(w => w.name).join(', '))

const aba19 = wb.getWorksheet('19')
if (aba19) {
  console.log(`\nAba 19: ${aba19.rowCount} rows × ${aba19.columnCount} cols`)
  for (let r = 1; r <= Math.min(6, aba19.rowCount); r++) {
    const row = aba19.getRow(r)
    const vals = []
    for (let c = 1; c <= Math.min(10, aba19.columnCount); c++) {
      const v = row.getCell(c).value
      vals.push(v === null || v === undefined || v === '' ? '·' : String(v).slice(0, 22))
    }
    console.log(`R${String(r).padStart(2)}:`, vals.join(' | '))
  }
}

const linhas = await parseEscalaArmazemGrao(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '2026-05-19')
console.log(`\nParseou ${linhas.length} linhas pra 2026-05-19`)
for (const l of linhas) {
  console.log(`  ${l.loja_nome_raw.padEnd(35)} | ${(l.motorista_nome ?? '—').padEnd(20)} | ${(l.placa_norm ?? '—')}`)
}
