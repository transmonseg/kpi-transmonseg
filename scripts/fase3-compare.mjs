/**
 * FASE 3 - Comparação gerado vs manual para dia 20/05/2026
 * Execução: npx tsx scripts/fase3-compare.mjs
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
import path from 'path'
import fs from 'fs'

const KPIS_MANUAIS = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/KPIS MANUAIS'
const KPIS_AUTO    = 'C:/Users/media/Desktop/kpi-output'

// Mapeamento: rede_id → arquivo manual
const REDES = [
  { id: 'ASSAI',        manual: 'KPI ASSAI (1).xlsx',       auto: 'KPI ASSAI.xlsx' },
  { id: 'ATACADAO',     manual: 'KPI ATACADAO (1).xlsx',    auto: 'KPI ATACADAO.xlsx' },
  { id: 'CARREFOUR',    manual: 'KPI CARREFOUR (1).xlsx',   auto: 'KPI CARREFOUR.xlsx' },
  { id: 'GUANABARA',    manual: 'KPI GUANABARA (1).xlsx',   auto: null },
  { id: 'PREZUNIC',     manual: 'KPI PREZUNIC (3).xlsx',    auto: 'KPI PREZUNIC.xlsx' },
  { id: 'PRINCESA',     manual: 'KPI PRINCESA (8).xlsx',    auto: 'KPI PRINCESA.xlsx' },
  { id: 'SUPERPRIX',    manual: 'KPI SUPERPRIX (1).xlsx',   auto: 'KPI SUPERPRIX.xlsx' },
  { id: 'ZONA_SUL',     manual: 'KPI ZONA SUL.xlsx',        auto: 'KPI ZONA_SUL.xlsx' },
  { id: 'ARMAZEM_GRAO', manual: 'KPI ARMAZEM DO GRAO.xlsx', auto: 'KPI ARMAZEM_GRAO.xlsx' },
]

function norm(s) {
  if (!s) return ''
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .trim()
}

function serialParaHora(v) {
  if (typeof v === 'string' && v.includes(':')) return v
  if (!v && v !== 0) return ''
  // Strings como 'SEM RASTREADOR' / 'NÃO FOI AO CLIENTE' → sem dado de tempo
  if (typeof v === 'string') return ''
  const totalMin = Math.round(v * 24 * 60)
  const h = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function lerTodasAbas(filePath) {
  if (!fs.existsSync(filePath)) return null
  const wb = XLSX.readFile(filePath)
  return wb.SheetNames
}

// Mapeamento de colunas por rede/tipo de arquivo.
// Formato padrão (GERAL): col0=loja, col1=mot, col2=cod, col3=placa, col4=saida_cd, col5=chd, col6=saida
// Zona Sul manual:         col0=loja, col1=mot, col2=placa (sem cod), col3=saida_cd, col4=chd, col5=saida
const COL_MAP_DEFAULT  = { placa: 3, saida_cd: 4, chd: 5, saida: 6, mot2: 7, placa2: 9, saida_cd2: 10, chd2: 11, saida2: 12 }
const COL_MAP_ZONA_SUL = { placa: 2, saida_cd: 3, chd: 4, saida: 5, mot2: 6, placa2: 8, saida_cd2: 9,  chd2: 10, saida2: 11 }

function lerLinhasDeAba(filePath, abaName, colMap = COL_MAP_DEFAULT) {
  if (!fs.existsSync(filePath)) return []
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[abaName]
  if (!ws) return []
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 })

  const linhas = []
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    const col0 = String(row[0] ?? '').trim()
    if (!col0) continue
    // pula linhas de cabeçalho ou seção
    if (norm(col0) === norm('REDES / FILIAIS') || norm(col0) === norm('REDES/FILIAIS') ||
        col0.toUpperCase().includes('RELATÓRIO') || col0.toUpperCase().includes('RELATORIO') ||
        norm(col0) === 'REDESFILIAIS' ||
        // Cabeçalhos de seção do tipo "REDE 1º CARRO" que aparecem dentro de KPIs de outra rede
        /\d[ºoa°]\s*CARRO/i.test(col0) ||
        // Título da aba KPI (ex: "RELATÓRIO KPI - Prezunic\nBENASSI")
        norm(col0).startsWith('RELATORIOKPI')) continue

    const placa1 = norm(String(row[colMap.placa] ?? ''))
    // Rejeita "placas" que são números puros (seriais de horário Excel)
    if (placa1 && /^\d{8,}$/.test(placa1)) continue
    const mot1 = String(row[1] ?? '').trim()

    linhas.push({
      loja: col0,
      loja_norm: norm(col0),
      placa1,
      motorista1: mot1,
      saida_cd1: serialParaHora(row[colMap.saida_cd]),
      chd1:       serialParaHora(row[colMap.chd]),
      saida1:     serialParaHora(row[colMap.saida]),
      placa2:     norm(String(row[colMap.placa2] ?? '')),
      motorista2: String(row[colMap.mot2] ?? '').trim(),
      saida_cd2:  serialParaHora(row[colMap.saida_cd2]),
      chd2:       serialParaHora(row[colMap.chd2]),
      saida2:     serialParaHora(row[colMap.saida2]),
    })
  }
  return linhas
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════════')
console.log('║ FASE 3 — Comparação KPI Gerado vs Manual  |  Dia 20/05/2026')
console.log('╚══════════════════════════════════════════════════════════════════\n')

const resumo = []

for (const rede of REDES) {
  const manualPath = path.join(KPIS_MANUAIS, rede.manual)

  // Inspeciona abas disponíveis no manual
  const abasManual = lerTodasAbas(manualPath) ?? []
  const abaManual = abasManual.find(a => a === '20' || a === '20.05' || a.includes('20')) ?? abasManual[0]

  if (!rede.auto) {
    console.log(`\n── ${rede.id} ──────────────────────────────────────`)
    console.log(`  [SKIP] Sem arquivo gerado (escala Guanabara não carregada)`)
    const manualLinhas = abaManual ? lerLinhasDeAba(manualPath, abaManual, COL_MAP_DEFAULT) : []
    console.log(`  Manual: ${manualLinhas.length} linhas (aba: ${abaManual ?? 'n/a'})`)
    resumo.push({ rede: rede.id, skip: true, manual_linhas: manualLinhas.length })
    continue
  }

  const autoPath = path.join(KPIS_AUTO, rede.auto)
  const abasAuto = lerTodasAbas(autoPath) ?? []
  const abaAuto = abasAuto.find(a => a === '20.05' || a === '20' || a.includes('20')) ?? abasAuto[0]

  // Zona Sul manual usa col2=placa (sem coluna "cod"); auto usa formato padrão col3=placa
  const manualColMap = rede.id === 'ZONA_SUL' ? COL_MAP_ZONA_SUL : COL_MAP_DEFAULT
  const manualLinhas = abaManual ? lerLinhasDeAba(manualPath, abaManual, manualColMap) : []
  const autoLinhas   = abaAuto  ? lerLinhasDeAba(autoPath, abaAuto)    : []

  console.log(`\n── ${rede.id} ──────────────────────────────────────`)
  console.log(`  Manual: ${manualLinhas.length} linhas (aba: ${abaManual ?? 'n/a'}, abas: ${abasManual.join(', ')})`)
  console.log(`  Auto:   ${autoLinhas.length} linhas (aba: ${abaAuto ?? 'n/a'}, abas: ${abasAuto.join(', ')})`)

  // Mapa por loja normalizada
  const mapManual = new Map(manualLinhas.map(r => [r.loja_norm, r]))
  const mapAuto   = new Map(autoLinhas.map(r => [r.loja_norm, r]))

  let ok = 0, diff = 0, soManual = 0, soAuto = 0
  const problemas = []

  const todasLojas = new Set([...mapManual.keys(), ...mapAuto.keys()])
  for (const k of [...todasLojas].sort()) {
    const m = mapManual.get(k)
    const a = mapAuto.get(k)
    if (!m) { soAuto++; continue }
    if (!a) { soManual++; problemas.push(`  [SÓ MANUAL] ${m.loja}  (placa: ${m.placa1||'-'}, mot: ${m.motorista1||'-'})`); continue }

    // Compara placas (principal indicador de match)
    const placaOk = m.placa1 === a.placa1
    const horariosDiff = []
    for (const campo of ['saida_cd1','chd1','saida1','saida_cd2','chd2','saida2']) {
      if (m[campo] && a[campo] && m[campo] !== a[campo]) {
        horariosDiff.push(`${campo}: ${m[campo]}→${a[campo]}`)
      }
    }

    if (placaOk && horariosDiff.length === 0) {
      ok++
    } else {
      diff++
      const linha = `  [DIFF] ${m.loja}  manual_placa=${m.placa1||'-'} auto_placa=${a.placa1||'-'}` +
        (horariosDiff.length > 0 ? `  | ${horariosDiff.join(' | ')}` : '')
      problemas.push(linha)
    }
  }

  const total = todasLojas.size
  const pct = total > 0 ? Math.round(ok / total * 100) : 0

  console.log(`  Match perfeito: ${ok}/${total} (${pct}%)`)
  console.log(`  Divergentes: ${diff}  |  Só manual: ${soManual}  |  Só auto: ${soAuto}`)

  if (problemas.length > 0) {
    console.log(`  Problemas:`)
    problemas.slice(0, 20).forEach(p => console.log(p))
    if (problemas.length > 20) console.log(`  ... e mais ${problemas.length - 20}`)
  }

  resumo.push({ rede: rede.id, ok, diff, soManual, soAuto, total, pct })
}

// ─── Resumo geral ─────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════════')
console.log('║ RESUMO GERAL')
console.log('╠══════════════════════════════════════════════════════════════════')
let totalOk = 0, totalTotal = 0
for (const r of resumo) {
  if (r.skip) {
    console.log(`║  ${r.rede.padEnd(14)} → SKIP (sem escala Guanabara)`)
    continue
  }
  console.log(`║  ${r.rede.padEnd(14)} → ${r.ok}/${r.total} perfeitas (${r.pct}%)  diff=${r.diff} só_manual=${r.soManual} só_auto=${r.soAuto}`)
  totalOk += r.ok
  totalTotal += r.total
}
const pctGlobal = totalTotal > 0 ? Math.round(totalOk / totalTotal * 100) : 0
console.log(`╠══════════════════════════════════════════════════════════════════`)
console.log(`║  GLOBAL: ${totalOk}/${totalTotal} (${pctGlobal}%)`)
console.log(`╚══════════════════════════════════════════════════════════════════\n`)
