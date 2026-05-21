import ExcelJS from 'exceljs'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'docs/ground-truth-dia-20'
const files = readdirSync(dir).filter(f => f.endsWith('.xlsx'))

for (const file of files) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(join(dir, file))
  const aba20 = wb.getWorksheet('20')
  if (!aba20) {
    console.log(`\n${file}: SEM aba "20" — abas: ${wb.worksheets.map(w => w.name).join(', ')}`)
    continue
  }
  // conta linhas com placa preenchida (linhas reais, não cabeçalho)
  let linhasComPlaca = 0
  let linhasUnmatched = 0
  let primeiroExemplo = null
  for (let r = 3; r <= aba20.rowCount; r++) {
    const row = aba20.getRow(r)
    const placa = String(row.getCell(4).value ?? row.getCell(3).value ?? '').trim()
    const saidaCd = row.getCell(5).value
    if (placa && placa.length >= 6) {
      linhasComPlaca++
      const saidaStr = saidaCd ? String(saidaCd) : ''
      if (!saidaCd || saidaStr.includes('SEM') || saidaStr.includes('RASTREADOR')) linhasUnmatched++
      if (!primeiroExemplo) {
        primeiroExemplo = `${row.getCell(1).value} | ${placa} | saida=${saidaStr.slice(0,30)}`
      }
    }
  }
  console.log(`${file}: aba "20" → ${linhasComPlaca} linhas com placa, ${linhasUnmatched} unmatched (SEM RASTREADOR)`)
  if (primeiroExemplo) console.log(`  ex: ${primeiroExemplo}`)
}
