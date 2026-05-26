import ExcelJS from 'exceljs'

async function main() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile('C:/Users/media/Downloads/KPI-PREZUNIC-2026-05-19 (2).xlsx')
  const ws = wb.worksheets[0]
  console.log('Sheet:', ws.name, 'rows:', ws.rowCount)
  // Procura ANDERSON / LCE-4337
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cells: any[] = []
    for (let c = 1; c <= 14; c++) {
      const v = row.getCell(c).value
      if (v instanceof Date) cells.push(v.toISOString().slice(11, 16))
      else if (typeof v === 'number' && v > 0 && v < 1) cells.push((v * 24).toFixed(2) + 'h')
      else cells.push(v ? String(v).slice(0, 30) : '')
    }
    const text = cells.join(' | ')
    if (text.includes('ANDERSON') || text.includes('LCE-4337') || text.includes('LCE4337') || text.includes('Caxias')) {
      console.log(`Row ${r}:`, text)
    }
  }
}
main().catch(e => console.error(e))
