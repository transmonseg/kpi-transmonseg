import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { argv } from 'node:process'

const files = argv.slice(2)
for (const f of files) {
  try {
    const buf = readFileSync(f)
    const wb = XLSX.read(buf, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
    const periodo = (rows[1]?.[0] ?? '').toString()
    // Datas dos dados (r05 e r07 col C)
    const dataR5 = (rows[4]?.[2] ?? '').toString()
    const dataR7 = (rows[6]?.[2] ?? '').toString()
    console.log(`${f.split(/[\\/]/).pop().padEnd(28)} | ${periodo.padEnd(70)} | r05Data=${dataR5} | r07Data=${dataR7} | ${wb.SheetNames.length} abas`)
  } catch (e) {
    console.log(`${f.split(/[\\/]/).pop()}: ERRO ${e.message}`)
  }
}
