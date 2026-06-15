// Análise completa da escala Zona Sul: por loja, separa DONOS (1ª entrega) de
// CARONAS (2ª/3ª entrega), e classifica como o KPI deveria ficar organizado.
// Uso: npx tsx scripts/dev/analise-completa.ts
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { normalizaPlaca } from '@/lib/utils/placa'
import { formataDataISO } from '@/lib/utils/data-brasileira'

const ESCALA = 'C:/Users/media/Downloads/ESCALA-HOJE-auto_1780231342372.xlsx'
const DATA = '2026-05-31'

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
const hhmm = (v: unknown) => { if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`; const s = toStr(v); const m = s?.match(/(\d+):(\d+)/); return m ? `${m[1].padStart(2,'0')}:${m[2]}` : null }
const ultimoNome = (v: unknown) => { const s = toStr(v); if (!s) return null; const p = s.split('/'); return p[p.length-1].trim() || null }
const ehPlaca = (p: string | null) => !!p && /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)

type Ent = { placa: string; mot: string | null; pos: number; hora: string | null }

async function main() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync(ESCALA) as unknown as ArrayBuffer)
  const ws = wb.getWorksheet('MATRIZ')!
  let cur: Date | null = null
  const porLoja = new Map<string, Ent[]>()
  let veiculos = 0

  ws.eachRow((row) => {
    const r: unknown[] = []; for (let c = 1; c <= 22; c++) r.push(cv(row.getCell(c)))
    if (r[9] === 'CARREGAMENTO DIÁRIO') { const d = r[17]; if (d instanceof Date) cur = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); return }
    if (!cur || formataDataISO(cur) !== DATA) return
    const placa = normalizaPlaca(toStr(r[14]))
    if (!ehPlaca(placa)) return // ignora linhas de aviso/observação
    veiculos++
    const mot = ultimoNome(r[18])
    const hora = hhmm(r[1])
    ;[r[3], r[5], r[7]].forEach((loja, i) => {
      const l = toStr(loja); if (!l || isNaN(parseInt(l, 10))) return
      const num = String(parseInt(l, 10))
      const arr = porLoja.get(num) ?? []
      arr.push({ placa: placa!, mot, pos: i + 1, hora })
      porLoja.set(num, arr)
    })
  })

  // Classifica cada loja
  let so1carro = 0, doisDonos = 0, donoMaisCarona = 0, soCarona = 0
  const detalhe: string[] = []
  for (const [num, arr] of [...porLoja.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const donosSet = new Set(arr.filter(e => e.pos === 1).map(e => e.placa))
    const caronasSet = new Set(arr.filter(e => e.pos > 1).map(e => e.placa))
    for (const p of donosSet) caronasSet.delete(p) // se é dono em algum lugar, não conta como carona
    const nd = donosSet.size, nc = caronasSet.size
    let tipo: string
    if (nd >= 2) { doisDonos++; tipo = `🔴 ${nd} CARROS (2 donos)` }
    else if (nd === 1 && nc >= 1) { donoMaisCarona++; tipo = `🟡 1 carro + ${nc} carona` }
    else if (nd === 1) { so1carro++; tipo = '🟢 1 carro' }
    else { soCarona++; tipo = `⚪ só carona (${nc})` }
    const donos = [...donosSet].join(', ') || '-'
    const caronas = [...caronasSet].join(', ') || '-'
    detalhe.push(`  Filial ${num}: ${tipo}  | donos: ${donos} | caronas: ${caronas}`)
  }

  console.log(`Veículos na escala: ${veiculos}  |  Lojas: ${porLoja.size}\n`)
  console.log('=== RESUMO (como o KPI ficaria por loja) ===')
  console.log(`  🟢 1 carro só (1 dono):              ${so1carro}`)
  console.log(`  🔴 2 carros de verdade (2 donos):    ${doisDonos}`)
  console.log(`  🟡 1 carro + carona (só passa):       ${donoMaisCarona}`)
  console.log(`  ⚪ só carona (loja não é destino):    ${soCarona}\n`)
  console.log('=== DETALHE por loja ===')
  console.log(detalhe.join('\n'))
}
main().catch(e => { console.error(e); process.exit(1) })
