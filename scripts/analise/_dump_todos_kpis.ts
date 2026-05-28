import ExcelJS from 'exceljs'
import { readdirSync } from 'fs'

const DIR = 'docs/conversas-tia-erica/dia-19/kpis-pos-deploy/'
async function main() {
  const files = readdirSync(DIR).sort()
  for (const f of files) {
    if (!f.endsWith('.xlsx')) continue
    const rede = f.match(/KPI-(.+?)-2026/)?.[1] ?? f
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(DIR + f)
    const ws = wb.worksheets[0]
    console.log(`\n=== ${rede} ===`)
    const fmt = (v: unknown) => {
      if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`
      return String(v ?? '').slice(0, 40)
    }
    for (let r = 4; r <= ws.rowCount; r++) {
      const loja = fmt(ws.getCell(r, 1).value).padEnd(42)
      const mot1 = fmt(ws.getCell(r, 2).value).slice(0, 18).padEnd(18)
      const placa1 = fmt(ws.getCell(r, 4).value).padEnd(10)
      const sd1 = fmt(ws.getCell(r, 5).value).padEnd(6)
      const chd1 = fmt(ws.getCell(r, 6).value).padEnd(6)
      const sl1 = fmt(ws.getCell(r, 7).value).padEnd(6)
      const mot2 = fmt(ws.getCell(r, 8).value).slice(0, 14).padEnd(14)
      const placa2 = fmt(ws.getCell(r, 10).value).padEnd(10)
      const sd2 = fmt(ws.getCell(r, 11).value).padEnd(6)
      const chd2 = fmt(ws.getCell(r, 12).value).padEnd(6)
      const sl2 = fmt(ws.getCell(r, 13).value).padEnd(6)
      if (!loja.trim() && !mot1.trim()) continue
      console.log(`${loja}|${mot1}${placa1}|${sd1}${chd1}${sl1}|${mot2}${placa2}|${sd2}${chd2}${sl2}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
