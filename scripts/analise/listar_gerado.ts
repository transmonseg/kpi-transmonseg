import ExcelJS from 'exceljs'

;(async () => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile('C:/Users/media/Downloads/KPI-GUANABARA-2026-05-19 (6).xlsx')
  const ws = wb.worksheets[0]
  console.log('Sheet:', ws.name, 'rows:', ws.rowCount)
  for (let r = 1; r <= ws.rowCount; r++) {
    const loja = ws.getRow(r).getCell(1).value
    if (loja) console.log('R' + r + ':', String(loja).slice(0, 60))
  }
})()
