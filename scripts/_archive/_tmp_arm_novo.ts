import ExcelJS from 'exceljs'

;(async () => {
  const path = 'C:/Users/media/Downloads/KPI ARMAZEM DO GRAO (1).xlsx'
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  console.log('Abas:', wb.worksheets.map(w => `${w.name}(${w.rowCount}r)`).join(', '))
})()
