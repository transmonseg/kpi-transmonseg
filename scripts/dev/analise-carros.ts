// Por filial: lista cada entrega com posição (1ª/2ª/3ª), hora e kilos.
// Uso: npx tsx scripts/dev/analise-carros.ts
import ExcelJS from 'exceljs'
import { normalizaPlaca } from '@/lib/utils/placa'
import { formataDataISO } from '@/lib/utils/data-brasileira'

const ESCALA = 'C:/Users/media/Downloads/ESCALA-HOJE-auto_1780231342372.xlsx'
const DATA_ALVO = '2026-05-31'

const cellVal = (cell: ExcelJS.Cell): unknown => {
  const v = cell.value
  if (v == null) return null
  if (typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Record<string, unknown>
    if ('text' in o) return o.text
    if ('result' in o) return o.result
    if ('richText' in o) return (o.richText as { text: string }[]).map(r => r.text).join('')
  }
  return v
}
const toStr = (v: unknown) => { if (v == null) return null; const s = String(v).trim(); return s === '' ? null : s }
const toNum = (v: unknown) => { if (v == null) return null; const n = Number(v); return isNaN(n) ? null : n }
const hhmm = (v: unknown) => { if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`; const s = toStr(v); const m = s?.match(/(\d+):(\d+)/); return m ? `${m[1].padStart(2,'0')}:${m[2]}` : (s ?? '-') }
const ultimoNome = (v: unknown) => { const s = toStr(v); if (!s) return null; const p = s.split('/'); return p[p.length-1].trim() || null }

type Ent = { placa: string; mot: string | null; pos: number; hora: string; kilos: number | null; row: number }

async function main() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(ESCALA)
  const ws = wb.getWorksheet('MATRIZ')!
  let currentDate: Date | null = null
  const porFilial = new Map<string, Ent[]>()

  ws.eachRow((row, n) => {
    const r: unknown[] = []
    for (let c = 1; c <= 22; c++) r.push(cellVal(row.getCell(c)))
    if (r[9] === 'CARREGAMENTO DIÁRIO') {
      const d = r[17]
      if (d instanceof Date) currentDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      return
    }
    if (!currentDate) return
    if (formataDataISO(currentDate) !== DATA_ALVO) return
    const placa = normalizaPlaca(toStr(r[14]))
    if (!placa) return
    const mot = ultimoNome(r[18])
    const hora = hhmm(r[1])
    const entregas: [unknown, unknown][] = [[r[3], r[4]], [r[5], r[6]], [r[7], r[8]]]
    entregas.forEach(([loja, kilos], i) => {
      const l = toStr(loja); if (!l) return
      const num = String(parseInt(l, 10) || l)
      const arr = porFilial.get(num) ?? []
      arr.push({ placa, mot, pos: i + 1, hora, kilos: toNum(kilos), row: n })
      porFilial.set(num, arr)
    })
  })

  console.log(`Filiais (data carga ${DATA_ALVO}): ${porFilial.size}\n`)
  console.log('=== Filiais com 2+ PLACAS distintas (geram 2º carro) ===\n')
  const sorted = [...porFilial.entries()].sort((a, b) => (Number(a[0]) || 999) - (Number(b[0]) || 999))
  for (const [fil, arr] of sorted) {
    const placas = [...new Set(arr.map(a => a.placa))]
    if (placas.length < 2) continue
    console.log(`Filial ${fil}  (${placas.length} placas):`)
    for (const a of arr) console.log(`   ${a.placa} / ${a.mot ?? '-'}   ${a.pos}ª entrega   hora=${a.hora}   kilos=${a.kilos ?? '-'}   [L${a.row}]`)
    console.log('')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
