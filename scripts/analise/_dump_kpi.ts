/** Dump qualquer KPI xlsx em texto */
import ExcelJS from 'exceljs'

async function main() {
  const file = process.argv[2]
  if (!file) { console.error('uso: tsx _dump_kpi.ts <arquivo.xlsx>'); return }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.worksheets[0]
  console.log(`# ${file}\nAba: ${ws.name}  rows: ${ws.rowCount}`)
  const fmt = (v: unknown) => {
    if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`
    return String(v ?? '').slice(0, 35)
  }
  for (let r = 1; r <= ws.rowCount; r++) {
    const cells: string[] = []
    for (let c = 1; c <= 14; c++) cells.push(fmt(ws.getCell(r, c).value))
    console.log(`r${String(r).padStart(2,'0')}: ${cells.map((s, i) => s.padEnd(i < 4 ? 35 : 8)).join('|')}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
