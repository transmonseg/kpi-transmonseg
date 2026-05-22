/**
 * Compara KPI gerado (Downloads/KPI-{REDE}-2026-05-19.xlsx)
 * vs KPI manual (Downloads/KPI {REDE}.xlsx, aba "19")
 *
 * Uso: node scripts/compare-gerado-vs-manual.mjs [REDE]
 *   Ex: node scripts/compare-gerado-vs-manual.mjs SUPERPRIX
 *   Sem argumento: compara todas as redes com manual disponível
 */

import ExcelJS from 'exceljs'
import path from 'path'
import { fileURLToPath } from 'url'

const DL = 'C:/Users/media/Downloads'

const REDES = [
  { id: 'SUPERPRIX',  gerado: 'KPI-SUPERPRIX-2026-05-19.xlsx',  manual: 'KPI SUPERPRIX.xlsx' },
  { id: 'PRINCESA',   gerado: 'KPI-PRINCESA-2026-05-19.xlsx',   manual: 'KPI PRINCESA (7).xlsx' },
  { id: 'PREZUNIC',   gerado: 'KPI-PREZUNIC-2026-05-19.xlsx',   manual: 'KPI PREZUNIC (2).xlsx' },
  { id: 'GUANABARA',  gerado: 'KPI-GUANABARA-2026-05-19.xlsx',  manual: 'KPI GUANABARA.xlsx' },
  { id: 'CARREFOUR',  gerado: 'KPI-CARREFOUR-2026-05-19.xlsx',  manual: 'KPI CARREFOUR.xlsx' },
  { id: 'ATACADAO',   gerado: 'KPI-ATACADAO-2026-05-19.xlsx',   manual: 'KPI ATACADAO.xlsx' },
  { id: 'ASSAI',      gerado: 'KPI-ASSAI-2026-05-19.xlsx',      manual: 'KPI ASSAI.xlsx' },
]

function toHHMM(val) {
  if (!val) return null
  if (val instanceof Date) {
    const h = val.getUTCHours()
    const m = val.getUTCMinutes()
    if (h === 0 && m === 0) return null
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }
  if (typeof val === 'number') {
    if (val === 0) return null
    const totalMin = Math.round(val * 24 * 60)
    const h = Math.floor(totalMin / 60) % 24
    const m = totalMin % 60
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }
  if (typeof val === 'object' && val !== null) {
    if (val.result !== undefined) return toHHMM(val.result)
    if (val.formula) return null
  }
  const s = String(val).trim()
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0,5)
  return null
}

function normStr(s) {
  if (!s) return ''
  return String(s).toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function normPlaca(s) {
  return String(s || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
}

async function lerGerado(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(DL, file))
  // Tenta aba "19.05" ou "19"
  const ws = wb.getWorksheet('19.05') || wb.getWorksheet('19') || wb.worksheets[0]
  if (!ws) return []

  // Detecta linha de header (procura "REDES" nas primeiras 5 linhas)
  let headerRow = 3
  for (let r = 1; r <= 5; r++) {
    const v = normStr(ws.getRow(r).getCell(1).value)
    if (v.includes('REDES') || v.includes('FILIAIS')) { headerRow = r; break }
  }
  const dataStart = headerRow + 2 // pula header + linha em branco

  const rows = []
  ws.eachRow((row, r) => {
    if (r < dataStart) return
    const loja = normStr(row.getCell(1).value)
    if (!loja) return
    const placa = normPlaca(row.getCell(4).value)
    const saidaCD = toHHMM(row.getCell(5).value)
    const chdLoja = toHHMM(row.getCell(6).value)
    const saidaLoja = toHHMM(row.getCell(7).value)
    const motorista = normStr(row.getCell(2).value)
    rows.push({ r, loja, motorista, placa, saidaCD, chdLoja, saidaLoja })
  })
  return rows
}

async function lerManual(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(DL, file))
  const ws = wb.getWorksheet('19')
  if (!ws) return []

  // Detecta linha de header
  let headerRow = 2
  for (let r = 1; r <= 5; r++) {
    const v = normStr(ws.getRow(r).getCell(1).value)
    if (v.includes('REDES') || v.includes('FILIAIS')) { headerRow = r; break }
  }
  const dataStart = headerRow + 2

  const rows = []
  ws.eachRow((row, r) => {
    if (r < dataStart) return
    const loja = normStr(row.getCell(1).value)
    if (!loja) return
    const placa = normPlaca(row.getCell(4).value)
    const saidaCD = toHHMM(row.getCell(5).value)
    const chdLoja = toHHMM(row.getCell(6).value)
    const saidaLoja = toHHMM(row.getCell(7).value)
    const motorista = normStr(row.getCell(2).value)
    rows.push({ r, loja, motorista, placa, saidaCD, chdLoja, saidaLoja })
  })
  return rows
}

// Similaridade entre nomes de loja (0..1) — fuzzy match sem biblioteca externa
function simLoja(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  // tokens em comum / max(tokens_a, tokens_b)
  const ta = new Set(a.split(' ').filter(t => t.length >= 3))
  const tb = new Set(b.split(' ').filter(t => t.length >= 3))
  let common = 0
  for (const t of ta) if (tb.has(t)) common++
  const denom = Math.max(ta.size, tb.size)
  return denom === 0 ? 0 : common / denom
}

// Casa cada linha do gerado com a linha do manual de maior similaridade de nome
function casarPorLoja(gerado, manual) {
  const usados = new Set()
  const pares = []

  for (const g of gerado) {
    let melhorSim = 0, melhorM = null
    for (const m of manual) {
      if (usados.has(m)) continue
      const s = simLoja(g.loja, m.loja)
      if (s > melhorSim) { melhorSim = s; melhorM = m }
    }
    if (melhorSim >= 0.4 && melhorM) {
      usados.add(melhorM)
      pares.push({ g, m: melhorM, sim: melhorSim })
    } else {
      pares.push({ g, m: null, sim: 0 })
    }
  }

  // Manuais sem par = faltando no gerado
  const faltando = manual.filter(m => !usados.has(m))
  return { pares, faltando }
}

function compararRede(id, gerado, manual) {
  const result = {
    rede: id,
    totalGerado: gerado.length,
    totalManual: manual.length,
    semGpsGerado: 0,
    semGpsManual: 0,
    diffs: [],
    extras: [],
    faltando: [],
  }

  const { pares, faltando } = casarPorLoja(gerado, manual)

  for (const { g, m } of pares) {
    const temGps = !!(g.saidaCD || g.chdLoja)
    if (!temGps) result.semGpsGerado++

    if (!m) { result.extras.push({ loja: g.loja, placa: g.placa }); continue }

    const temGpsM = !!(m.saidaCD || m.chdLoja)
    if (!temGpsM) result.semGpsManual++

    const row = { loja_g: g.loja, loja_m: m.loja, issues: [] }

    if (!temGps && temGpsM) row.issues.push('SEM_GPS')

    if (g.placa && m.placa && g.placa !== m.placa)
      row.issues.push(`PLACA:${g.placa}≠${m.placa}`)

    if (g.saidaCD && m.saidaCD && g.saidaCD !== m.saidaCD)
      row.issues.push(`SAIDA_CD:${g.saidaCD}≠${m.saidaCD}`)
    else if (!g.saidaCD && m.saidaCD)
      row.issues.push(`SAIDA_CD:null≠${m.saidaCD}`)

    if (g.chdLoja && m.chdLoja && g.chdLoja !== m.chdLoja)
      row.issues.push(`CHD_LOJA:${g.chdLoja}≠${m.chdLoja}`)
    else if (!g.chdLoja && m.chdLoja)
      row.issues.push(`CHD_LOJA:null≠${m.chdLoja}`)

    if (row.issues.length > 0) result.diffs.push(row)
  }

  for (const m of faltando) {
    if (!!(m.saidaCD || m.chdLoja)) result.semGpsManual++
    result.faltando.push({ loja: m.loja, placa: m.placa })
  }

  return result
}

async function analisarRede(cfg) {
  const [gerado, manual] = await Promise.all([
    lerGerado(cfg.gerado).catch(() => []),
    lerManual(cfg.manual).catch(() => []),
  ])

  const r = compararRede(cfg.id, gerado, manual)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`REDE: ${r.rede}`)
  console.log(`  Linhas: gerado=${r.totalGerado}  manual=${r.totalManual}`)
  console.log(`  Sem GPS: ${r.semGpsGerado} gerado / ${r.semGpsManual} manual`)
  console.log(`  Diffs: ${r.diffs.length}  Extras: ${r.extras.length}  Faltando: ${r.faltando.length}`)

  if (r.diffs.length > 0) {
    console.log(`\n  DIFERENÇAS (gerado vs manual):`)
    for (const d of r.diffs) {
      console.log(`    [${d.idx}] ${d.loja_g.slice(0,35).padEnd(35)} → ${d.issues.join(' | ')}`)
    }
  }

  if (r.faltando.length > 0) {
    console.log(`\n  FALTANDO NO GERADO (só manual):`)
    for (const f of r.faltando) {
      console.log(`    [${f.idx}] ${f.loja} / ${f.placa}`)
    }
  }

  if (r.extras.length > 0) {
    console.log(`\n  EXTRAS NO GERADO (não estão no manual):`)
    for (const e of r.extras) {
      console.log(`    [${e.idx}] ${e.loja} / ${e.placa}`)
    }
  }

  return r
}

const args = process.argv.slice(2)
const filtro = args[0]?.toUpperCase()
const redes = filtro ? REDES.filter(r => r.id === filtro) : REDES

const resultados = []
for (const cfg of redes) {
  const r = await analisarRede(cfg)
  resultados.push(r)
}

console.log(`\n${'='.repeat(60)}`)
console.log('SUMÁRIO GERAL:')
for (const r of resultados) {
  const ok = r.totalGerado === r.totalManual && r.semGpsGerado === 0 && r.diffs.length === 0
  const status = ok ? '✓' : '✗'
  console.log(`  ${status} ${r.rede.padEnd(12)} gerado=${r.totalGerado} manual=${r.totalManual} semGPS=${r.semGpsGerado} diffs=${r.diffs.length} falt=${r.faltando.length} extra=${r.extras.length}`)
}
