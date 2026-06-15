// Simula a regra "carro que rodou (tem horário) = 1º carro" no KPI gerado.
// Uso: npx tsx scripts/dev/sim-reordena.ts
import ExcelJS from 'exceljs'

const KPI = 'C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-31 (2).xlsx'

const txt = (v: ExcelJS.CellValue) => { if (v == null) return ''; if (typeof v === 'object' && !(v instanceof Date)) { const o = v as Record<string, unknown>; return String(o.text ?? o.result ?? '') } return String(v) }
const temHora = (v: ExcelJS.CellValue) => typeof v === 'number' || v instanceof Date // número = serial de hora; texto ("SEM RASTREADOR") não conta

async function main() {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(KPI)
  const ws = wb.worksheets[0]
  let inverter = 0, doisComHora = 0, ok = 0, com2 = 0
  const inverteLista: string[] = []
  ws.eachRow((row, n) => {
    if (n <= 3) return
    const loja = txt(row.getCell(1).value).trim()
    if (!loja || /redes|filiais|carro|relat/i.test(loja)) return
    const c1placa = txt(row.getCell(4).value), c2placa = txt(row.getCell(10).value)
    if (!c2placa) return
    com2++
    const c1hora = temHora(row.getCell(5).value) || temHora(row.getCell(6).value)
    const c2hora = temHora(row.getCell(11).value) || temHora(row.getCell(12).value)
    if (!c1hora && c2hora) { inverter++; inverteLista.push(`  ${loja}: 1º ${c1placa} (sem horário) ↔ 2º ${c2placa} (TEM horário) → inverter`) }
    else if (c1hora && c2hora) { doisComHora++ }
    else ok++
  })
  console.log(`Lojas com 2 carros no KPI: ${com2}\n`)
  console.log(`⚠️  Carro com horário preso no 2º slot (precisa inverter): ${inverter}`)
  console.log(`🔴 2 carros COM horário na mesma loja (2º carro de verdade):  ${doisComHora}`)
  console.log(`✅ Já ok (1º tem horário, ou nenhum tem):                      ${ok}\n`)
  if (inverteLista.length) { console.log('Lojas a inverter:'); console.log(inverteLista.join('\n')) }
}
main().catch(e => { console.error(e); process.exit(1) })
