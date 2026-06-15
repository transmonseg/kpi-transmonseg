// Explica dono vs carona com horários reais (Unitrac + KPI gerado).
// Uso: npx tsx scripts/dev/explica-carros.ts
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { normalizaPlaca } from '@/lib/utils/placa'

const KPI = 'C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-31 (2).xlsx'
const UNITRAC = 'C:/Users/media/Downloads/UNITRAC-HOJE-unitrac.pdf'

const hm = (d: Date | null | undefined) => d ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : '--:--'

async function main() {
  // 1) ROTA de cada veículo pelo GPS (Unitrac)
  console.log('═══ ROTA DE CADA VEÍCULO (pelo GPS / Unitrac) ═══\n')
  const resumos = await parseUnitracPdf(readFileSync(UNITRAC))
  const foco = ['AOP3C73', 'LQE5401', 'BBH1C94']
  for (const placa of foco) {
    const r = resumos.find(x => normalizaPlaca(x.placa_norm) === placa)
    if (!r) { console.log(`${placa}: não encontrado no GPS\n`); continue }
    console.log(`🚚 ${placa}  (saída CD: ${hm(r.saida_cd)})`)
    r.paradas.forEach((p, i) => {
      const nome = p.nome_loja || p.local_parada || '?'
      console.log(`    parada ${i + 1}: [${p.classificacao}] ${nome}  chegada ${hm(p.chegada)} → saída ${hm(p.saida)}`)
    })
    console.log('')
  }

  // 2) Como ficou no KPI gerado (Loja 21 e Loja 30)
  console.log('═══ COMO FICOU NO KPI GERADO (sem o fix de ordem ainda) ═══\n')
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(KPI)
  const ws = wb.worksheets[0]
  const serial = (v: ExcelJS.CellValue): string => {
    if (v == null || v === '') return '--'
    if (v instanceof Date) return hm(v)
    if (typeof v === 'number') { const min = Math.round(v * 1440); return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}` }
    if (typeof v === 'object') { const o = v as Record<string, unknown>; const r = o.result ?? o.text; return r != null ? serial(r as ExcelJS.CellValue) : '--' }
    return String(v)
  }
  const txt = (v: ExcelJS.CellValue) => { if (v == null) return ''; if (typeof v === 'object' && !(v instanceof Date)) { const o = v as Record<string, unknown>; return String(o.text ?? o.result ?? '') } return String(v) }
  ws.eachRow((row, n) => {
    if (n <= 3) return
    const loja = txt(row.getCell(1).value).trim()
    if (!/Loja (21|30) /.test(loja)) return
    console.log(`📍 ${loja}`)
    console.log(`    1º carro: ${txt(row.getCell(4).value)} (${txt(row.getCell(2).value)})  saídaCD ${serial(row.getCell(5).value)} | chegada ${serial(row.getCell(6).value)} | saída ${serial(row.getCell(7).value)}`)
    console.log(`    2º carro: ${txt(row.getCell(10).value)} (${txt(row.getCell(8).value)})  saídaCD ${serial(row.getCell(11).value)} | chegada ${serial(row.getCell(12).value)} | saída ${serial(row.getCell(13).value)}`)
    console.log('')
  })
}
main().catch(e => { console.error(e); process.exit(1) })
