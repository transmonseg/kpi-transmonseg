import ExcelJS from 'exceljs'

;(async () => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile('C:/Users/media/Downloads/KPI GUANABARA (1).xlsx')
  for (const ws of wb.worksheets) console.log('Sheet:', ws.name, 'rows:', ws.rowCount)
  const ws = wb.worksheets[0]
  for (let r = 1; r <= Math.min(40, ws.rowCount); r++) {
    const row = ws.getRow(r)
    const cells: string[] = []
    for (let c = 1; c <= 16; c++) {
      const v = row.getCell(c).value
      let s = ''
      if (v == null) s = ''
      else if (v instanceof Date) s = v.toISOString().slice(11, 16)
      else if (typeof v === 'object' && 'richText' in v) s = (v as any).richText.map((r: any) => r.text).join('').trim()
      else if (typeof v === 'number' && v >= 0 && v < 1) {
        const total = Math.round(v * 86400)
        s = `${Math.floor(total/3600)}:${String(Math.floor((total%3600)/60)).padStart(2,'0')}`
      }
      else s = String(v).slice(0, 25)
      cells.push(s.padEnd(20))
    }
    console.log(`R${r}: ${cells.join('|')}`)
  }
})()
