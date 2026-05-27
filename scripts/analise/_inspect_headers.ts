import ExcelJS from 'exceljs'

async function main() {
  const path = 'docs/conversas-tia-erica/dia-25/kpis-gerados/KPI-ASSAI-2026-05-25.xlsx'
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  wb.eachSheet((ws) => {
    console.log(`\n══ Sheet: "${ws.name}" (${ws.rowCount} rows) ══`)
    for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
      const row = ws.getRow(r)
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        const v = cell.value
        cells.push(`[${c}]=${JSON.stringify(v)}`)
      })
      console.log(`R${r}: ${cells.join(' | ').slice(0, 500)}`)
    }
  })
}
main()
