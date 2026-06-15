// Cruza o KPI gerado com a escala real, loja por loja, pra achar 2º carros errados.
// Uso: npx tsx scripts/dev/analise-kpi-vs-escala.ts
import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'

const KPI = 'C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-31.xlsx'
const ESCALA = 'C:/Users/media/Downloads/ESCALA-HOJE-auto_1780231342372.xlsx'
const DATA = '2026-05-31'

const txt = (v: ExcelJS.CellValue): string => {
  if (v == null) return ''
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('text' in o) return String(o.text)
    if ('result' in o) return String(o.result)
    if ('richText' in o) return (o.richText as { text: string }[]).map(r => r.text).join('')
  }
  return String(v)
}
const normPlaca = (s: string) => s.replace(/[^A-Z0-9]/gi, '').toUpperCase()
const numFilial = (nome: string): string | null => {
  const m = nome.match(/loja\s*0*(\d+)/i) || nome.match(/^0*(\d{1,3})\b/) || nome.match(/\b0*(\d{1,3})\b/)
  return m ? m[1] : null
}

type KpiRow = { loja: string; num: string | null; c1p: string; c1m: string; c2p: string; c2m: string }

async function lerKpi(): Promise<KpiRow[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(KPI)
  const ws = wb.worksheets[0]
  const out: KpiRow[] = []
  ws.eachRow((row, n) => {
    if (n <= 3) return
    const loja = txt(row.getCell(1).value).trim()
    if (!loja || /redes|filiais|carro|relat[óo]rio/i.test(loja)) return
    out.push({
      loja, num: numFilial(loja),
      c1m: txt(row.getCell(2).value).trim(), c1p: normPlaca(txt(row.getCell(4).value)),
      c2m: txt(row.getCell(8).value).trim(), c2p: normPlaca(txt(row.getCell(10).value)),
    })
  })
  return out
}

async function main() {
  const kpi = await lerKpi()
  const esc = (await parseEscalaZonaSul(readFileSync(ESCALA), DATA)).filter(l => l.rede_id === 'ZONA_SUL')

  // Índice da escala por número de filial → linhas {carro_ordem, placa, motorista}
  const escByFilial = new Map<string, { carro: number; placa: string; mot: string; raw: string }[]>()
  for (const l of esc) {
    const num = numFilial(l.loja_nome_raw) ?? l.loja_codigo_raw ?? l.loja_nome_raw
    const key = String(num)
    const arr = escByFilial.get(key) ?? []
    arr.push({ carro: l.carro_ordem, placa: normPlaca(l.placa_norm ?? ''), mot: l.motorista_nome ?? '', raw: l.loja_nome_raw })
    escByFilial.set(key, arr)
  }

  console.log(`KPI: ${kpi.length} lojas | Escala ZS: ${esc.length} linhas | Filiais na escala: ${escByFilial.size}\n`)
  console.log('=== ESCALA (cru, por filial) ===')
  for (const [num, arr] of [...escByFilial.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  f${num} (${arr[0].raw}): ${arr.map(a => `c${a.carro}/${a.placa || '-'}/${a.mot}`).join('  |  ')}`)
  }

  console.log('\n=== CRUZAMENTO KPI x ESCALA ===')
  const problemas: string[] = []
  for (const k of kpi) {
    const arr = k.num ? escByFilial.get(k.num) ?? [] : []
    const e1 = arr.find(a => a.carro === 1)
    const e2 = arr.find(a => a.carro === 2)
    const probs: string[] = []
    if (k.c2p && !e2) probs.push(`2º CARRO INDEVIDO (KPI tem ${k.c2p}/${k.c2m}, escala não tem 2º carro nesta loja)`)
    if (k.c1p && e1 && k.c1p !== e1.placa) probs.push(`1º placa diverge (KPI ${k.c1p} ≠ escala ${e1.placa})`)
    if (k.c2p && e2 && k.c2p !== e2.placa) probs.push(`2º placa diverge (KPI ${k.c2p} ≠ escala ${e2.placa})`)
    if (k.c1p && !e1 && arr.length === 0) probs.push(`loja não casou com a escala (num=${k.num})`)
    const tag = probs.length ? '⚠️ ' + probs.join(' ; ') : 'ok'
    if (probs.length) problemas.push(`${k.loja} → ${tag}`)
    console.log(`  ${k.loja}  [1º ${k.c1p || '-'} | 2º ${k.c2p || '-'}]  ${tag}`)
  }

  console.log(`\n=== RESUMO: ${problemas.length} loja(s) com problema ===`)
  for (const p of problemas) console.log('  ' + p)
}
main().catch(e => { console.error(e); process.exit(1) })
