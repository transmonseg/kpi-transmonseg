import ExcelJS from 'exceljs'

const arquivos = [
  'KPI PRINCESA (8)', 'KPI GUANABARA (2)', 'KPI CARREFOUR (1)',
  'KPI ASSAI (1)', 'KPI ATACADAO (1)', 'KPI SUPERPRIX (1)', 'KPI PREZUNIC (3)',
]
;(async () => {
  for (const a of arquivos) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile('C:/Users/media/Downloads/' + a + '.xlsx')
    console.log(`${a}: ${wb.worksheets.map(w => w.name).join(', ')}`)
  }
})()
