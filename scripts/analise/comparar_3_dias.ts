import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'
import { lerKpi, normLoja } from './_lib/ler-kpi'

const GER = {
  19: 'C:/Users/media/Downloads/KPI-ARMAZEM_GRAO-2026-05-19 (7).xlsx',
  20: 'C:/Users/media/Downloads/KPI-ARMAZEM_GRAO-2026-05-20 (1).xlsx',
  21: 'C:/Users/media/Downloads/KPI-ARMAZEM_GRAO-2026-05-21 (2).xlsx',
}

const MAN_19_20 = 'C:/Users/media/Downloads/KPI ARMAZEM DO GRAO.xlsx'
const MAN_21 = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI-ARMAZEM_GRAO-MANUAL.xlsx'

function fmtCell(v: any): string {
  if (v == null || v === '') return '---'
  const s = String(v).trim()
  if (/n[aã]o\s+foi/i.test(s)) return 'NÃO_FOI'
  if (/sem\s+rast/i.test(s)) return 'SEM_RAST'
  // Excel pode armazenar hora como Date relativo a 1899-12-31 com timezone arcaico
  if (s instanceof Date || /1899/.test(s)) {
    const d = new Date(s)
    // Ajusta tz LMT do Rio (-2h34)
    const ms = d.getTime() + 2*3600*1000 + 34*60*1000
    const dt = new Date(ms)
    return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
  }
  // hh:mm
  const m = s.match(/(\d{1,2}):(\d{2})/)
  if (m) return `${m[1].padStart(2,'0')}:${m[2]}`
  return s.slice(0, 8)
}

async function lerManualARMAZEM(dia: number) {
  if (dia === 21) {
    const wb = XLSX.read(readFileSync(MAN_21), { type: 'buffer', cellDates: true })
    const ws = wb.Sheets['21.05']
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
    const out: Record<string, { sc: string; chd: string; sl: string }> = {}
    // colunas: A loja, E SC, F CHD, G SL
    for (const r of rows) {
      if (!r || r.length < 7) continue
      const loja = String(r[0] ?? '').trim()
      if (!loja || /REDES|RELAT|MOTORISTA/i.test(loja)) continue
      out[loja] = { sc: fmtCell(r[4]), chd: fmtCell(r[5]), sl: fmtCell(r[6]) }
    }
    return out
  }
  // dia 19 ou 20 do arquivo mensal
  const wb = XLSX.read(readFileSync(MAN_19_20), { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[String(dia)]
  if (!ws) throw new Error(`Aba ${dia} não encontrada`)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
  const out: Record<string, { sc: string; chd: string; sl: string }> = {}
  for (const r of rows) {
    if (!r || r.length < 7) continue
    const loja = String(r[0] ?? '').trim()
    if (!loja || /REDES|RELAT|MOTORISTA/i.test(loja)) continue
    out[loja] = { sc: fmtCell(r[4]), chd: fmtCell(r[5]), sl: fmtCell(r[6]) }
  }
  return out
}

;(async () => {
  for (const dia of [19, 20, 21] as const) {
    console.log(`\n═══════════════ DIA ${dia} ═══════════════`)
    const manual = await lerManualARMAZEM(dia)
    const gerado = await lerKpi(GER[dia])
    const gByLoja = new Map(gerado.map(l => [normLoja(l.loja), l]))
    let ok = 0, parcial = 0, errado = 0, na = 0
    for (const [loja, m] of Object.entries(manual)) {
      const k = normLoja(loja)
      const g = gByLoja.get(k)
      if (!g) { console.log(`  ❓ SÓ MANUAL: ${loja.slice(0,42).padEnd(42)} man=${m.sc}/${m.chd}/${m.sl}`); continue }
      const sys = `${g.sc1}/${g.chd1}/${g.sl1}`
      const man = `${m.sc}/${m.chd}/${m.sl}`
      const naoFoi = /N[aã]o.*Foi/i.test(loja) || m.chd === 'NÃO_FOI' || m.chd === 'SEM_RAST'
      const sysSem = g.chd1 === '---' || !g.chd1
      if (naoFoi) {
        if (sysSem) { ok++; console.log(`  ✅ ${loja.slice(0,42).padEnd(42)} ambos sem entrega`) }
        else { errado++; console.log(`  ⚠️ ${loja.slice(0,42).padEnd(42)} sys=${sys} (manual=${man}) — sys diz FOI`) }
        continue
      }
      // Compara só CHD e SL (SC pode variar muito)
      const chdMatch = g.chd1 === m.chd
      const slMatch = g.sl1 === m.sl
      if (chdMatch && slMatch) { ok++; console.log(`  ✅ ${loja.slice(0,42).padEnd(42)} ${sys}`) }
      else if (sysSem) { errado++; console.log(`  ❌ ${loja.slice(0,42).padEnd(42)} sys=---  man=${man}`) }
      else {
        // Calcula diff
        const toMin = (t: string) => { const m = t.match(/(\d+):(\d+)/); return m ? parseInt(m[1])*60+parseInt(m[2]) : null }
        const dChd = toMin(g.chd1) !== null && toMin(m.chd) !== null ? Math.abs(toMin(g.chd1)! - toMin(m.chd)!) : null
        const dSl = toMin(g.sl1) !== null && toMin(m.sl) !== null ? Math.abs(toMin(g.sl1)! - toMin(m.sl)!) : null
        if (dChd !== null && dSl !== null && dChd <= 5 && dSl <= 10) {
          parcial++; console.log(`  ⚠️ ${loja.slice(0,42).padEnd(42)} sys=${sys}  man=${man}  (ΔCHD=${dChd}min ΔSL=${dSl}min)`)
        } else {
          errado++; console.log(`  ❌ ${loja.slice(0,42).padEnd(42)} sys=${sys}  man=${man}`)
        }
      }
    }
    console.log(`\n  Resultado dia ${dia}: ${ok} ✅  |  ${parcial} ⚠️ próximo  |  ${errado} ❌`)
  }
})()
