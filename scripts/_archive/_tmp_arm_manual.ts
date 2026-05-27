import ExcelJS from 'exceljs'
import { lerKpi } from './_lib/ler-kpi'

;(async () => {
  const path = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI-ARMAZEM_GRAO-MANUAL.xlsx'
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  console.log('Abas:', wb.worksheets.map(w => w.name))

  for (const sheet of ['19', '20', '21', '21.05']) {
    try {
      const linhas = await lerKpi(path, sheet)
      console.log(`\nAba ${sheet}: ${linhas.length} linhas`)
      for (const l of linhas.slice(0,5)) console.log(`  ${l.loja.slice(0,40)} | sc=${l.sc1} chd=${l.chd1} sl=${l.sl1}`)
    } catch (e: any) {
      console.log(`Aba ${sheet}: ERRO ${e.message}`)
    }
  }
})()
