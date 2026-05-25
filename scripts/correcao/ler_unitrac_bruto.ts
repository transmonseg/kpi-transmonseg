/**
 * Lê o relatório Unitrac BRUTO e exibe linha por linha pra eu (Claude)
 * interpretar visualmente. Sem inferências automáticas — só leio o que tá lá.
 */
import { readFileSync } from 'fs'
import ExcelJS from 'exceljs'

const PATH = process.argv[2] || 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22/relatorio_9588.xlsx'
const PLACA_FILTRO = process.argv[3]  // opcional: filtrar por placa

async function main() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(PATH)
  const sheet = wb.worksheets[0]
  console.log(`Sheet: ${sheet.name}`)
  console.log(`Total rows: ${sheet.rowCount}`)
  console.log('')

  // Header
  const headerRow = sheet.getRow(1)
  const headers: string[] = []
  for (let c = 1; c <= 20; c++) {
    const v = headerRow.getCell(c).value
    if (v == null) break
    headers.push(String(v))
  }
  console.log('Colunas:', headers.join(' | '))
  console.log('---')

  let count = 0
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const cells: string[] = []
    for (let c = 1; c <= headers.length; c++) {
      const v = row.getCell(c).value
      cells.push(v == null ? '' : String(v))
    }
    // Se filtro de placa, só mostra dessa placa
    if (PLACA_FILTRO && !cells.some(c => c.includes(PLACA_FILTRO))) continue
    console.log(`[${r}]`, cells.join(' | '))
    count++
    if (count > 100) break
  }
}

main().catch(e => { console.error(e); process.exit(1) })
