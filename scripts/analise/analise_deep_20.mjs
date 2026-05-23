/**
 * Análise profunda placa a placa — Zona Sul dia 20/05/2026
 * Cruza: Escala ZS × Unitrac DB × KPI manual × KPI gerado (v5)
 */
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://luhwpsckvbctxynifryk.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1aHdwc2NrdmJjdHh5bmlmcnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwMzE0MSwiZXhwIjoyMDk0Mjc5MTQxfQ.t4R0Rxs4l9VH6YoR-8aE6Bno7hRr86m6FQq35CaD6bQ'
const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20'
const DATA = '2026-05-20'

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

function cv(cell) {
  const v = cell?.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && v.richText) return v.richText.map(r => r.text).join('').trim()
  if (typeof v === 'object' && v.text) return String(v.text).trim()
  return String(v).trim()
}
function normPlaca(p) { return p ? p.replace(/[^A-Z0-9]/gi, '').toUpperCase() : '' }
function toHHMM(iso) {
  if (!iso) return '---'
  const d = new Date(iso)
  return d.getUTCHours() + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}
function fmtKpi(v) {
  if (!v) return '---'
  if (typeof v === 'object' && v.result !== undefined) v = v.result
  if (v instanceof Date) return v.getUTCHours() + ':' + String(v.getUTCMinutes()).padStart(2, '0')
  if (typeof v === 'number') {
    const s = Math.round(v * 86400)
    return Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  }
  if (typeof v === 'string') return v.slice(0, 15)
  return '---'
}

// ── Ler escala Zona Sul ──────────────────────────────────────────────────────
async function lerEscala() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(BASE + '/ESCALA ZONA SUL - MAIO (7).xlsx')
  let ws = wb.worksheets.find(w => w.name.includes('20')) || wb.worksheets[0]
  process.stderr.write('Aba escala: ' + ws.name + '\n')
  const linhas = []
  ws.eachRow((row, rn) => {
    if (rn < 3) return
    const loja = cv(row.getCell(1))
    if (!loja || loja.match(/^REDE|^REDES|^FILIAL$/i)) return
    const p1 = normPlaca(cv(row.getCell(4)))
    const p2 = normPlaca(cv(row.getCell(10)) || cv(row.getCell(7)))
    const m1 = cv(row.getCell(2)), c1 = cv(row.getCell(3))
    const m2 = cv(row.getCell(8)) || cv(row.getCell(5))
    const c2 = cv(row.getCell(9)) || cv(row.getCell(6))
    if (p1 || p2) linhas.push({ loja, mot1: m1, cod1: c1, placa1: p1, mot2: m2, cod2: c2, placa2: p2 })
  })
  return linhas
}

// ── Ler KPI xlsx ────────────────────────────────────────────────────────────
async function lerKpi(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  const map = {}
  for (let r = 5; r <= 70; r++) {
    const row = ws.getRow(r)
    const loja = cv(row.getCell(1))
    if (!loja) continue
    const gt = c => {
      const v = row.getCell(c).value
      if (typeof v === 'string' && (v.includes('SEM') || v.includes('NÃO'))) return v.slice(0, 3)
      return fmtKpi(v)
    }
    map[loja] = { placa1: cv(row.getCell(4)), sc1: gt(5), chd1: gt(6), sl1: gt(7),
                  placa2: cv(row.getCell(10)), sc2: gt(11), chd2: gt(12), sl2: gt(13) }
  }
  return map
}

// ── Buscar paradas DB por placa ──────────────────────────────────────────────
async function buscarParadasDB(placas) {
  // placas é array de placa_norm
  const inicio = DATA + 'T00:00:00Z'
  const fim    = DATA + 'T23:59:59Z'
  const { data, error } = await sb
    .from('unitrac_paradas')
    .select('placa_norm, chegada, saida, duracao_seg, local_parada, codigo_loja, nome_loja, classificacao')
    .in('placa_norm', placas)
    .gte('chegada', inicio)
    .lte('chegada', fim)
    .order('chegada')
  if (error) throw new Error('Supabase: ' + error.message)
  // agrupar por placa
  const map = {}
  for (const p of data) {
    if (!map[p.placa_norm]) map[p.placa_norm] = []
    map[p.placa_norm].push(p)
  }
  return map
}

// ── Variantes OCR ────────────────────────────────────────────────────────────
function ocrVariants(placa) {
  const swaps = [['0','O'],['1','I'],['1','J'],['5','S'],['8','B'],['3','E'],['6','G']]
  const alts = new Set()
  for (const [a,b] of swaps) {
    alts.add(placa.replace(new RegExp(a,'g'),b))
    alts.add(placa.replace(new RegExp(b,'g'),a))
  }
  alts.delete(placa)
  return [...alts]
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const [escala, kpiM, kpiG] = await Promise.all([
    lerEscala(),
    lerKpi('C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-20.xlsx'),
    lerKpi('C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-20 (5).xlsx'),
  ])

  // coletar todas as placas + variantes OCR
  const todasPlacas = new Set()
  for (const l of escala) {
    if (l.placa1) { todasPlacas.add(l.placa1); ocrVariants(l.placa1).forEach(v => todasPlacas.add(v)) }
    if (l.placa2) { todasPlacas.add(l.placa2); ocrVariants(l.placa2).forEach(v => todasPlacas.add(v)) }
  }

  const paradasDB = await buscarParadasDB([...todasPlacas])
  process.stderr.write(`Placas no DB: ${Object.keys(paradasDB).length}\n`)

  // resolver placa → placa_norm que existe no DB
  const resolveGps = placa => {
    if (paradasDB[placa]) return placa
    return ocrVariants(placa).find(v => paradasDB[v]) || null
  }

  console.log('=== ANÁLISE PLACA A PLACA — ZONA SUL 20/05/2026 ===\n')

  const stats = { ok: 0, diff: 0, semGps: 0, ocrFix: 0, falsoPosGps: 0 }

  for (const linha of escala) {
    for (const slot of [1, 2]) {
      const placa   = slot === 1 ? linha.placa1 : linha.placa2
      const mot     = slot === 1 ? linha.mot1   : linha.mot2
      const cod     = slot === 1 ? linha.cod1   : linha.cod2
      if (!placa) continue

      const gpsPlaca = resolveGps(placa)
      const ocrFix   = gpsPlaca && gpsPlaca !== placa
      if (!gpsPlaca) stats.semGps++
      if (ocrFix)    stats.ocrFix++

      const paradas = gpsPlaca ? (paradasDB[gpsPlaca] || []) : []
      const pBase   = paradas.filter(p => p.classificacao === 'BASE')
      const pLoja   = paradas.filter(p => p.classificacao === 'LOJA')
      const pFora   = paradas.filter(p => p.classificacao === 'FORA_BASE')

      const km = kpiM[linha.loja] || {}
      const kg = kpiG[linha.loja] || {}
      const mArr = slot===1 ? [km.sc1||'---',km.chd1||'---',km.sl1||'---'] : [km.sc2||'---',km.chd2||'---',km.sl2||'---']
      const gArr = slot===1 ? [kg.sc1||'---',kg.chd1||'---',kg.sl1||'---'] : [kg.sc2||'---',kg.chd2||'---',kg.sl2||'---']
      const diff = mArr.join('/') !== gArr.join('/')
      if (diff) stats.diff++; else stats.ok++

      const tag  = diff ? '[DIFF]' : '[OK]  '
      const gpsTag = !gpsPlaca ? 'GPS:NAO' :
        `GPS:SIM${ocrFix?'(OCR '+gpsPlaca+')':''} [${paradas.length}p | ${pBase.length}B ${pLoja.length}L ${pFora.length}F]`

      console.log(`\n${tag} ${linha.loja}  [slot${slot}]`)
      console.log(`       ${mot} | cod:${cod} | ${placa} | ${gpsTag}`)

      // — últimas saídas de BASE (saída do CD)
      const ultimasBase = pBase.filter(p => p.saida).slice(-2)
      for (const p of ultimasBase) {
        console.log(`       BASE  chg:${toHHMM(p.chegada)} sai:${toHHMM(p.saida)}  dur:${Math.round((p.duracao_seg||0)/60)}min`)
      }

      // — paradas LOJA
      if (pLoja.length > 0) {
        for (const p of pLoja) {
          const dur = p.duracao_seg ? Math.round(p.duracao_seg/60)+'min' : '?'
          console.log(`       LOJA  ${toHHMM(p.chegada)}-${toHHMM(p.saida)}  ${dur}  cod:${p.codigo_loja||'?'}  ${(p.nome_loja||p.local_parada||'').slice(0,50)}`)
        }
      } else if (gpsPlaca) {
        if (pFora.length > 0) {
          console.log(`       !! SEM LOJA — ${pFora.length} paradas FORA_BASE`)
          for (const p of pFora.slice(0, 3)) {
            console.log(`       FB    ${toHHMM(p.chegada)}-${toHHMM(p.saida)}  ${(p.local_parada||'').slice(0,50)}`)
          }
        } else {
          console.log(`       !! SEM LOJA — só ${pBase.length} BASE`)
        }
      }

      console.log(`       MANUAL  : ${mArr.join(' / ')}`)
      console.log(`       GERADO  : ${gArr.join(' / ')}`)

      // diagnóstico específico para diffs
      if (diff) {
        // manual tem tarde, gerado tem madrugada?
        const mHora = parseInt(mArr[1]?.split(':')[0]||'0')
        const gHora = parseInt(gArr[1]?.split(':')[0]||'0')
        if (!isNaN(mHora) && !isNaN(gHora)) {
          if (mHora >= 10 && gHora < 8 && gHora > 0)
            console.log(`       DIAGNÓSTICO: gerado=madrugada, manual=tarde — veículo fez 2 turnos?`)
          else if (gHora >= 10 && mHora < 8 && mHora > 0)
            console.log(`       DIAGNÓSTICO: gerado=tarde, manual=madrugada`)
          else if (mArr[1] === 'SEM' || mArr[0] === 'SEM')
            console.log(`       DIAGNÓSTICO: manual=SEM RASTREADOR mas sistema gerou GPS — T18 falso positivo?`)
          else if (gArr[0] === '---' && mArr[0] !== '---')
            console.log(`       DIAGNÓSTICO: sistema não achou GPS para esta loja`)
        }
      }
    }
  }

  // ── Placas no DB sem escala ──────────────────────────────────────────────
  console.log('\n=== PLACAS COM GPS NO DIA 20 NÃO PRESENTES NA ESCALA ZS ===')
  const placasEscala = new Set(escala.flatMap(l => [l.placa1, l.placa2].filter(Boolean)))
  // buscar todas as placas do DB para o dia
  const { data: todasParadas } = await sb
    .from('unitrac_paradas')
    .select('placa_norm')
    .gte('chegada', DATA+'T00:00:00Z')
    .lte('chegada', DATA+'T23:59:59Z')
  const placasNoDb = new Set((todasParadas||[]).map(p=>p.placa_norm))
  for (const p of placasNoDb) {
    if (!placasEscala.has(p) && !ocrVariants(p).some(v => placasEscala.has(v))) {
      // conta paradas LOJA
      const { count } = await sb.from('unitrac_paradas')
        .select('*', {count:'exact',head:true})
        .eq('placa_norm', p).eq('classificacao','LOJA')
        .gte('chegada',DATA+'T00:00:00Z').lte('chegada',DATA+'T23:59:59Z')
      if (count > 0) console.log(`  ${p}  (${count} paradas LOJA)`)
    }
  }

  console.log('\n=== RESUMO ===')
  console.log(`OK:${stats.ok} | DIFF:${stats.diff} | SEM_GPS:${stats.semGps} | OCR_FIX:${stats.ocrFix}`)
}

main().catch(e => { console.error('ERRO:', e.stack); process.exit(1) })
