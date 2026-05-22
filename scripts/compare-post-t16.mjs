// Smoke comparison post-T16 vs manual ground truth
// Compares system-generated KPI vs manual KPI for dia 20/05/2026
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

const MANUAL_DIR = 'C:/Users/media/dev/kpi-transmonseg/docs/ground-truth-dia-20'
const POST_T16_DIR = 'C:/Users/media/Desktop/kpi-test/2026-05-20-post-t16'
const PRE_T16_DIR = 'C:/Users/media/Desktop/kpi-test/2026-05-20-smoke'

const NETWORKS = [
  { id: 'ARMAZEM_GRAO', manualFile: 'KPI-ARMAZEM-DO-GRAO-manual.xlsx', systemFile: 'KPI ARMAZEM_GRAO.xlsx' },
  { id: 'ASSAI',        manualFile: 'KPI-ASSAI-manual.xlsx',           systemFile: 'KPI ASSAI.xlsx' },
  { id: 'ATACADAO',     manualFile: 'KPI-ATACADAO-manual.xlsx',        systemFile: 'KPI ATACADAO.xlsx' },
  { id: 'CARREFOUR',    manualFile: 'KPI-CARREFOUR-manual.xlsx',       systemFile: 'KPI CARREFOUR.xlsx' },
  { id: 'PREZUNIC',     manualFile: 'KPI-PREZUNIC-manual.xlsx',        systemFile: 'KPI PREZUNIC.xlsx' },
  { id: 'PRINCESA',     manualFile: 'KPI-PRINCESA-manual.xlsx',        systemFile: 'KPI PRINCESA.xlsx' },
  { id: 'SUPERPRIX',    manualFile: 'KPI-SUPERPRIX-manual.xlsx',       systemFile: 'KPI SUPERPRIX.xlsx' },
  { id: 'ZONA_SUL',     manualFile: 'KPI-ZONA-SUL-manual.xlsx',        systemFile: 'KPI ZONA_SUL.xlsx' },
]

function serialParaHora(v) {
  if (typeof v === 'string') return v.trim()
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') {
    const totalMin = Math.round(v * 24 * 60)
    const h = Math.floor(totalMin / 60) % 24
    const m = totalMin % 60
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }
  return String(v)
}
function norm(s) {
  if (!s) return ''
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ')
}
function normPlaca(s) {
  if (!s) return ''
  return String(s).toUpperCase().replace(/[-\s]/g, '').trim()
}

function lerAba(filePath, abaName) {
  if (!fs.existsSync(filePath)) return null
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[abaName]
  if (!ws) return null
  return XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 })
}

// Try header-row detection: search for first row whose col A is empty followed by a row with actual store name
// Original layout: row 0=title, row 1=section, row 2=header, row 3+=data
function extraiLinhas(raw) {
  if (!raw || raw.length < 4) return []
  const linhas = []
  // Skip header rows: usually start at index 3 or 4
  let startIdx = 3
  // Some files may have row 0 = empty/title, find first row where col A looks like a store name
  for (let i = 0; i < Math.min(raw.length, 8); i++) {
    const cellA = String(raw[i]?.[0] || '').trim()
    if (cellA && !/^(REDES|RELAT|FILIAIS|CD\b)/i.test(cellA) && cellA.length > 3 && !cellA.includes('CARRO')) {
      // Make sure it's not the section header itself
      if (i >= 2) { startIdx = i; break }
    }
  }
  for (let i = startIdx; i < raw.length; i++) {
    const row = raw[i]
    if (!row) continue
    const colA = String(row[0] ?? '').trim()
    if (!colA) continue
    if (/^(REDES|RELAT|FILIAIS)/i.test(colA)) continue
    if (/CARRO/i.test(colA) && colA.length < 30) continue
    linhas.push({
      loja:       colA,
      motorista1: String(row[1] ?? '').trim(),
      cod1:       String(row[2] ?? '').trim(),
      placa1:     String(row[3] ?? '').trim(),
      saida_cd1:  serialParaHora(row[4]),
      chd1:       serialParaHora(row[5]),
      saida1:     serialParaHora(row[6]),
      motorista2: String(row[7] ?? '').trim(),
      cod2:       String(row[8] ?? '').trim(),
      placa2:     String(row[9] ?? '').trim(),
      saida_cd2:  serialParaHora(row[10]),
      chd2:       serialParaHora(row[11]),
      saida2:     serialParaHora(row[12]),
    })
  }
  return linhas
}

const CAMPOS = ['saida_cd1','chd1','saida1','saida_cd2','chd2','saida2']

function fieldsToCheck(m, a) {
  // Only check time fields where manual has a value (not "SEM RASTREADOR")
  return CAMPOS.filter(c => {
    const vm = m[c]
    if (!vm) return false
    if (/SEM RAST/i.test(vm)) return false
    return true
  })
}

function compareRede(manual, system, redeId) {
  const mapManual = new Map()
  for (const r of manual) mapManual.set(norm(r.loja), r)
  const mapSystem = new Map()
  for (const r of system) mapSystem.set(norm(r.loja), r)

  // Fuzzy matcher: prefix 20 or contained
  function fuzzyFind(key, targetMap) {
    if (targetMap.has(key)) return targetMap.get(key)
    const keys = [...targetMap.keys()]
    // Try prefix 20
    const p20 = key.substring(0, 20)
    for (const k of keys) if (k.startsWith(p20) || p20.length > 15 && k.includes(p20.substring(0, 15))) return targetMap.get(k)
    return null
  }

  let matched = 0, divergent = 0, onlyManual = 0, onlySystem = 0
  let manualSemRast = 0
  // Use MANUAL as ground truth — match % is over manual line count
  const diffDetails = []
  for (const k of mapManual.keys()) {
    const m = mapManual.get(k)
    const a = fuzzyFind(k, mapSystem) || mapSystem.get(k)
    if (!a) { onlyManual++; continue }

    // Detect SEM RASTREADOR in manual
    if (/SEM RAST/i.test(m.saida_cd1 || '')) {
      manualSemRast++
      // Treat as match if system also marks SEM RASTREADOR or has no horários
      const aTemTudo = !a.chd1 && !a.saida1 && !a.chd2 && !a.saida2
      if (aTemTudo || /SEM RAST/i.test(a.saida_cd1 || '')) matched++
      else divergent++
      continue
    }

    const fields = fieldsToCheck(m, a)
    if (fields.length === 0) {
      matched++; continue
    }
    function hhmmToMin(t) {
      if (!t || typeof t !== 'string') return null
      const m = t.match(/^(\d{1,2}):(\d{2})$/)
      if (!m) return null
      return parseInt(m[1])*60 + parseInt(m[2])
    }
    const diffs = []
    let allWithin10 = true
    for (const f of fields) {
      const vm = m[f]
      const va = a[f]
      if (vm === va) continue
      const mm = hhmmToMin(vm)
      const aa = hhmmToMin(va)
      if (mm !== null && aa !== null && Math.abs(mm - aa) <= 10) continue // tolerate ±10 min
      allWithin10 = false
      diffs.push(`${f}: manual=${vm||'-'} auto=${va||'-'}`)
    }
    if (diffs.length === 0) matched++
    else {
      divergent++
      diffDetails.push({ loja: m.loja, placa1: m.placa1, diffs })
    }
  }

  // Count system-only as informational
  for (const k of mapSystem.keys()) {
    if (!fuzzyFind(k, mapManual) && !mapManual.has(k)) onlySystem++
  }
  return { redeId, total: mapManual.size, matched, divergent, onlyManual, onlySystem, manualSemRast, diffDetails }
}

function runOne(net, systemDir) {
  const manualPath = path.join(MANUAL_DIR, net.manualFile)
  const systemPath = path.join(systemDir, net.systemFile)

  const manualRaw = lerAba(manualPath, '20')
  const systemRaw = lerAba(systemPath, '20.05') || lerAba(systemPath, '20')

  if (!manualRaw) return { ...net, error: `manual aba 20 não encontrada em ${manualPath}` }
  if (!systemRaw) return { ...net, error: `system aba 20 não encontrada em ${systemPath}` }

  const manual = extraiLinhas(manualRaw)
  const system = extraiLinhas(systemRaw)

  return compareRede(manual, system, net.id)
}

console.log('='.repeat(80))
console.log('SMOKE PÓS-T16 — DIA 20/05/2026')
console.log('='.repeat(80))

const resultsPre = []
const resultsPost = []

for (const net of NETWORKS) {
  const post = runOne(net, POST_T16_DIR)
  const pre = runOne(net, PRE_T16_DIR)
  resultsPre.push(pre)
  resultsPost.push(post)
}

console.log('\n┌─────────────────┬───────┬──────────┬─────────┬─────────┬─────────┬──────────┐')
console.log('│ Rede            │ Total │ Pre-T16  │ Pós-T16 │ Manual* │ Δ pós   │ Δ vs Pre │')
console.log('├─────────────────┼───────┼──────────┼─────────┼─────────┼─────────┼──────────┤')

const MANUAL_BASELINE = {
  ARMAZEM_GRAO: 100, ASSAI: 72, ATACADAO: 100, CARREFOUR: 100,
  PREZUNIC: 88, PRINCESA: 100, SUPERPRIX: 100, ZONA_SUL: 76
}
const PRE_T16_BASELINE = {
  ARMAZEM_GRAO: 44, ASSAI: 56, ATACADAO: 75, CARREFOUR: 83,
  PREZUNIC: 64, PRINCESA: 81, SUPERPRIX: 67, ZONA_SUL: 44
}

let totalPre = 0, totalPost = 0, totalLojas = 0
for (let i = 0; i < NETWORKS.length; i++) {
  const post = resultsPost[i]
  const pre = resultsPre[i]
  const id = NETWORKS[i].id
  if (post.error || pre.error) {
    console.log(`│ ${id.padEnd(15)} │ ERR   │ ${post.error || pre.error}`)
    continue
  }
  const total = post.total
  const prePct = pre.total ? Math.round(pre.matched / pre.total * 100) : 0
  const postPct = post.total ? Math.round(post.matched / post.total * 100) : 0
  const manualPct = MANUAL_BASELINE[id]
  const delta = postPct - prePct
  const deltaStr = delta >= 0 ? `+${delta}` : String(delta)
  totalPre += pre.matched
  totalPost += post.matched
  totalLojas += total
  console.log(`│ ${id.padEnd(15)} │ ${String(total).padStart(5)} │ ${String(prePct).padStart(3)}% (${String(pre.matched).padStart(2)}) │ ${String(postPct).padStart(3)}% (${String(post.matched).padStart(2)}) │ ${String(manualPct).padStart(3)}%   │  ${deltaStr.padStart(4)}pp │   ${deltaStr.padStart(4)}pp │`)
}
console.log('├─────────────────┼───────┼──────────┼─────────┼─────────┼─────────┼──────────┤')
const totalPrePct = Math.round(totalPre / totalLojas * 100)
const totalPostPct = Math.round(totalPost / totalLojas * 100)
const totalDelta = totalPostPct - totalPrePct
console.log(`│ TOTAL           │ ${String(totalLojas).padStart(5)} │ ${String(totalPrePct).padStart(3)}% (${String(totalPre).padStart(2)}) │ ${String(totalPostPct).padStart(3)}% (${String(totalPost).padStart(2)}) │  86%    │  +${String(totalDelta).padStart(3)}pp │   +${String(totalDelta).padStart(3)}pp │`)
console.log('└─────────────────┴───────┴──────────┴─────────┴─────────┴─────────┴──────────┘')

// Detail breakdown for biggest improvements
console.log('\n=== DETALHE POR REDE ===')
for (const r of resultsPost) {
  if (r.error) continue
  console.log(`\n[${r.redeId}] total=${r.total} matched=${r.matched} divergent=${r.divergent} onlyManual=${r.onlyManual} onlySystem=${r.onlySystem} manualSemRast=${r.manualSemRast}`)
  if (r.diffDetails.length > 0 && r.diffDetails.length <= 10) {
    for (const d of r.diffDetails) {
      console.log(`  DIFF ${d.loja} [placa:${d.placa1}]:`)
      d.diffs.slice(0, 3).forEach(x => console.log(`    ${x}`))
    }
  } else if (r.diffDetails.length > 10) {
    console.log(`  (${r.diffDetails.length} divergências — omitidas, mostrando 5 amostras)`)
    for (const d of r.diffDetails.slice(0, 5)) {
      console.log(`  DIFF ${d.loja} [placa:${d.placa1}]:`)
      d.diffs.slice(0, 3).forEach(x => console.log(`    ${x}`))
    }
  }
}

// QSZ-9A20 spot check
console.log('\n=== SPOT CHECK QSZ-9A20 (multi-trip Princesa→Armazém) ===')
for (const net of NETWORKS) {
  const systemRaw = lerAba(path.join(POST_T16_DIR, net.systemFile), '20.05') || lerAba(path.join(POST_T16_DIR, net.systemFile), '20')
  if (!systemRaw) continue
  const system = extraiLinhas(systemRaw)
  const matches = system.filter(r => normPlaca(r.placa1).includes('QSZ9A20') || normPlaca(r.placa2).includes('QSZ9A20'))
  for (const r of matches) {
    console.log(`  [${net.id}] ${r.loja} | placa1=${r.placa1} saidaCD1=${r.saida_cd1} chd1=${r.chd1} | placa2=${r.placa2} saidaCD2=${r.saida_cd2} chd2=${r.chd2}`)
  }
}
