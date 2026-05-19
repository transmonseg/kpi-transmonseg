import ExcelJS from 'exceljs'

function serialToHora(v: unknown): string {
  if (typeof v === 'string') return (v as string).trim()
  if (typeof v !== 'number' || isNaN(v as number)) return ''
  const n = v as number
  const totalMin = Math.round(n * 24 * 60)
  const h = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

function cv(cell: ExcelJS.Cell): string {
  const v = cell?.value
  if (v === null || v === undefined || v === '') return ''
  if (v instanceof Date) {
    const frac = (v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds()) / 86400
    return serialToHora(frac)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof v === 'object' && 'result' in (v as any)) return serialToHora((v as any).result)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof v === 'object' && 'text' in (v as any)) return String((v as any).text).trim()
  if (typeof v === 'number') return serialToHora(v)
  return String(v).trim()
}

async function lerLinhas(path: string, aba: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.getWorksheet(aba)
  if (!ws) {
    const abas = wb.worksheets.map(w => w.name).join(', ')
    console.log(`${path} - aba "${aba}" não encontrada. Disponíveis: ${abas}`)
    return []
  }
  const out: Record<string, string>[] = []
  ws.eachRow((row, i) => {
    if (i <= 4) return
    const loja = String(row.getCell(1).value ?? '').replace(/●/g, '').trim()
    if (!loja || loja.toUpperCase().includes('REDES') || loja.toUpperCase().startsWith('TOTAL')) return
    out.push({
      loja,
      saida_cd1: cv(row.getCell(5)),
      chd1:      cv(row.getCell(6)),
      saida1:    cv(row.getCell(7)),
      saida_cd2: cv(row.getCell(11)),
      chd2:      cv(row.getCell(12)),
      saida2:    cv(row.getCell(13)),
      mot1:      String(row.getCell(2).value ?? '').trim(),
      placa1:    String(row.getCell(4).value ?? '').trim(),
    })
  })
  return out
}

const MANUAL = 'C:/Users/media/Downloads/KPI PRINCESA (2).xlsx'
const AUTO   = 'C:/Users/media/Downloads/KPI-PRINCESA-2026-05-18-auto.xlsx'

async function main() {
const m = await lerLinhas(MANUAL, '18')
const a = await lerLinhas(AUTO, '18')
console.log(`MANUAL: ${m.length} lojas | AUTO: ${a.length} lojas\n`)

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const mapM = new Map(m.map(r => [norm(r.loja), r]))
const mapA = new Map(a.map(r => [norm(r.loja), r]))
const todas = new Set([...mapM.keys(), ...mapA.keys()])

const CAMPOS = ['saida_cd1', 'chd1', 'saida1', 'saida_cd2', 'chd2', 'saida2']
const LABELS = ['SaidaCD1', 'CHD1', 'Saida1', 'SaidaCD2', 'CHD2', 'Saida2']
let ok = 0, diff = 0, soM = 0, soA = 0

console.log('='.repeat(70))
for (const k of [...todas].sort()) {
  const mr = mapM.get(k), ar = mapA.get(k)
  if (!mr) { soA++; console.log(`[SÓ AUTO]   ${ar!.loja}`); continue }
  if (!ar) { soM++; console.log(`[SÓ MANUAL] ${mr.loja}  placa:${mr.placa1}  mot:${mr.mot1}`); continue }

  const diffs: string[] = []
  for (let i = 0; i < CAMPOS.length; i++) {
    const vm = mr[CAMPOS[i]], va = ar[CAMPOS[i]]
    if (!vm && !va) continue
    if (vm !== va) diffs.push(`  ${LABELS[i]}: manual=${vm || '-'} auto=${va || '-'}`)
  }
  if (!diffs.length) { ok++; continue }
  diff++
  console.log(`[DIFF] ${mr.loja}`)
  diffs.forEach(d => console.log(d))
}
console.log('='.repeat(70))
console.log(`\nOK=${ok}  DIFF=${diff}  SÓ_MANUAL=${soM}  SÓ_AUTO=${soA}`)
console.log(`Match perfeito: ${Math.round(ok / (ok + diff + soM + soA) * 100)}%`)
}
main().catch(console.error)
