import { readFile } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import ExcelJS from 'exceljs'

async function load(path) {
  const buf = await readFile(path)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  const ws = wb.worksheets[0]
  const linhas = []
  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const loja = row.getCell(1).value
    if (!loja || String(loja).trim() === '') continue
    const vals = []
    for (let c = 1; c <= 15; c++) {
      let v = row.getCell(c).value
      if (v && typeof v === 'object' && 'result' in v) v = v.result
      if (typeof v === 'number' && v >= 0 && v < 1) {
        const h = Math.floor(v * 24), m = Math.round((v * 24 - h) * 60)
        v = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
      }
      vals.push(v == null ? '' : String(v))
    }
    linhas.push(vals)
  }
  return linhas
}

const espDir = 'C:/Users/media/Downloads/DIA 19 KPI TESTE'
const espFile = (await readdir(espDir)).find(f => f.startsWith('KPI-PREZUNIC-2026-05-19'))
const esp = await load(`${espDir}/${espFile}`)
const ger = await load('C:/Users/media/dev/kpi-transmonseg/out/dia-19/KPI-PREZUNIC-2026-05-19.xlsx')

console.log(`esperado: ${esp.length} linhas, gerado: ${ger.length} linhas\n`)

const COLS = ['LOJA','MOT1','COD1','PLC1','SCD1','CHD1','SAI1','MOT2','COD2','PLC2','SCD2','CHD2','SAI2','TMP1','TMP2']

for (let i = 0; i < Math.max(esp.length, ger.length); i++) {
  const e = esp[i] ?? []
  const g = ger[i] ?? []
  const diffs = []
  for (let c = 0; c < 15; c++) {
    if ((e[c] ?? '').trim() !== (g[c] ?? '').trim()) {
      diffs.push(`${COLS[c]}: '${e[c]??''}' → '${g[c]??''}'`)
    }
  }
  if (diffs.length > 0) {
    console.log(`Linha ${i+5}: ${e[0] ?? ''}`)
    for (const d of diffs) console.log(`    ${d}`)
  }
}
