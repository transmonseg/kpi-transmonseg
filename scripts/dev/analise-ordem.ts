// Detecta lojas onde a ordem 1º/2º carro está invertida (carona como 1º, dono como 2º).
// Uso: npx tsx scripts/dev/analise-ordem.ts
import ExcelJS from 'exceljs'
import { normalizaPlaca } from '@/lib/utils/placa'
import { formataDataISO } from '@/lib/utils/data-brasileira'

const KPI = 'C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-31.xlsx'
const ESCALA = 'C:/Users/media/Downloads/ESCALA-HOJE-auto_1780231342372.xlsx'
const DATA_ALVO = '2026-05-31'

const cv = (cell: ExcelJS.Cell): unknown => {
  const v = cell.value
  if (v == null) return null
  if (typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Record<string, unknown>
    if ('text' in o) return o.text; if ('result' in o) return o.result
    if ('richText' in o) return (o.richText as { text: string }[]).map(r => r.text).join('')
  }
  return v
}
const toStr = (v: unknown) => { if (v == null) return null; const s = String(v).trim(); return s === '' ? null : s }
const txt = (v: ExcelJS.CellValue) => { const s = toStr(v as unknown); return s ?? '' }
const numFilial = (nome: string) => { const m = nome.match(/loja\s*0*(\d+)/i) || nome.match(/^0*(\d{1,3})\b/) || nome.match(/\b0*(\d{1,3})\b/); return m ? m[1] : null }

async function main() {
  // 1) KPI: loja(num) -> {c1, c2}
  const wbK = new ExcelJS.Workbook(); await wbK.xlsx.readFile(KPI)
  const wsK = wbK.worksheets[0]
  const kpi = new Map<string, { loja: string; c1: string; c2: string }>()
  wsK.eachRow((row, n) => {
    if (n <= 3) return
    const loja = txt(row.getCell(1).value).trim()
    if (!loja || /redes|filiais|carro|relat/i.test(loja)) return
    const num = numFilial(loja); if (!num) return
    kpi.set(num, { loja, c1: normalizaPlaca(txt(row.getCell(4).value)), c2: normalizaPlaca(txt(row.getCell(10).value)) })
  })

  // 2) Escala: "loja|placa" -> menor posição de entrega
  const wbE = new ExcelJS.Workbook(); await wbE.xlsx.readFile(ESCALA)
  const wsE = wbE.getWorksheet('MATRIZ')!
  let cur: Date | null = null
  const posDe = new Map<string, number>()
  wsE.eachRow((row) => {
    const r: unknown[] = []; for (let c = 1; c <= 22; c++) r.push(cv(row.getCell(c)))
    if (r[9] === 'CARREGAMENTO DIÁRIO') { const d = r[17]; if (d instanceof Date) cur = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); return }
    if (!cur || formataDataISO(cur) !== DATA_ALVO) return
    const placa = normalizaPlaca(toStr(r[14])); if (!placa) return
    ;[[r[3]], [r[5]], [r[7]]].forEach(([loja], i) => {
      const l = toStr(loja); if (!l) return
      const num = String(parseInt(l, 10) || l)
      const key = `${num}|${placa}`
      const prev = posDe.get(key)
      if (prev === undefined || i + 1 < prev) posDe.set(key, i + 1)
    })
  })

  console.log('=== Lojas com 2 carros: ordem dono(1ª entrega) vs carona(2ª/3ª) ===\n')
  let invertidas = 0, ok = 0
  for (const [num, k] of [...kpi.entries()].sort((a, b) => (Number(a[0]) || 999) - (Number(b[0]) || 999))) {
    if (!k.c2) continue
    const p1 = posDe.get(`${num}|${k.c1}`) ?? 9
    const p2 = posDe.get(`${num}|${k.c2}`) ?? 9
    const invertida = p1 > p2
    if (invertida) invertidas++; else ok++
    const flag = invertida ? `⚠️ INVERTIDA (1º=${k.c1} é ${p1}ª entrega, 2º=${k.c2} é ${p2}ª entrega → o dono deveria ser ${k.c2})` : 'ok'
    console.log(`  ${k.loja}: 1º ${k.c1}(${p1}ª) | 2º ${k.c2}(${p2}ª)  ${flag}`)
  }
  console.log(`\nRESUMO: ${invertidas} invertida(s), ${ok} ok`)
}
main().catch(e => { console.error(e); process.exit(1) })
