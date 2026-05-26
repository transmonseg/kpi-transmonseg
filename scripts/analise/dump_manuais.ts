import ExcelJS from 'exceljs'

const ARQUIVOS = [
  'C:/Users/media/Downloads/KPI PRINCESA (8).xlsx',
  'C:/Users/media/Downloads/KPI GUANABARA (2).xlsx',
  'C:/Users/media/Downloads/KPI CARREFOUR (1).xlsx',
  'C:/Users/media/Downloads/KPI ASSAI (1).xlsx',
  'C:/Users/media/Downloads/KPI ATACADAO (1).xlsx',
  'C:/Users/media/Downloads/KPI SUPERPRIX (1).xlsx',
  'C:/Users/media/Downloads/KPI PREZUNIC (3).xlsx',
]

function cvCell(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return ''
  const v = cell.value
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object' && 'richText' in v) return (v as any).richText.map((r: any) => r.text).join('').trim()
  if (typeof v === 'object' && 'text' in v) return String((v as any).text).trim()
  return String(v).slice(0, 60).trim()
}

;(async () => {
  for (const path of ARQUIVOS) {
    console.log(`\n═══ ${path.split('/').pop()} ═══`)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(path)
    console.log(`  Abas: ${wb.worksheets.length}: ${wb.worksheets.slice(0, 8).map(w => w.name).join(', ')}`)
    const ws = wb.worksheets[0]
    console.log(`  Primeira aba: ${ws.name}, rows: ${ws.rowCount}`)
    for (let r = 1; r <= Math.min(6, ws.rowCount); r++) {
      const cells: string[] = []
      for (let c = 1; c <= 6; c++) cells.push(cvCell(ws.getRow(r).getCell(c)).padEnd(25))
      console.log(`  R${r}: ${cells.join('|')}`)
    }
  }
})()
