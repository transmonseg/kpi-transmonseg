/**
 * Análise placa a placa — ZONA SUL 20/05/2026
 * Fonte das placas: KPI manual (tem loja→placa mapeado)
 * GPS: unitrac_paradas no DB
 * Comparação: manual vs gerado (v5)
 */
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

const sb = createClient(
  'https://luhwpsckvbctxynifryk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1aHdwc2NrdmJjdHh5bmlmcnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwMzE0MSwiZXhwIjoyMDk0Mjc5MTQxfQ.t4R0Rxs4l9VH6YoR-8aE6Bno7hRr86m6FQq35CaD6bQ'
)
const DATA = '2026-05-20'

function cv(cell) {
  const v = cell?.value
  if (!v && v !== 0) return ''
  if (typeof v === 'object' && v.richText) return v.richText.map(r => r.text).join('').trim()
  if (typeof v === 'object' && v.text) return String(v.text).trim()
  return String(v).trim()
}
function normPlaca(p) { return p ? p.replace(/[^A-Z0-9]/gi, '').toUpperCase() : '' }

function toHHMM(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.getUTCHours() + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

function fmtKpi(v) {
  if (!v) return null
  if (typeof v === 'object' && v.result !== undefined) v = v.result
  if (v instanceof Date) return v.getUTCHours() + ':' + String(v.getUTCMinutes()).padStart(2, '0')
  if (typeof v === 'number') {
    const s = Math.round(v * 86400)
    return Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  }
  if (typeof v === 'string') {
    if (v.includes('SEM')) return 'SEM_RASTR'
    if (v.includes('NÃO') || v.includes('NAO')) return 'NAO_FOI'
    return null
  }
  return null
}

async function lerKpiCompleto(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  const linhas = []
  for (let r = 5; r <= 70; r++) {
    const row = ws.getRow(r)
    const loja = cv(row.getCell(1))
    if (!loja) continue
    const placa1 = normPlaca(cv(row.getCell(4)))
    const placa2 = normPlaca(cv(row.getCell(10)))
    const mot1 = cv(row.getCell(2))
    const mot2 = cv(row.getCell(8))
    // carro 1
    if (placa1 || mot1) {
      linhas.push({
        loja, mot: mot1, placa: placa1, slot: 1,
        sc: fmtKpi(row.getCell(5).value),
        chd: fmtKpi(row.getCell(6).value),
        sl: fmtKpi(row.getCell(7).value),
      })
    }
    // carro 2
    if (placa2 || mot2) {
      linhas.push({
        loja, mot: mot2, placa: placa2, slot: 2,
        sc: fmtKpi(row.getCell(11).value),
        chd: fmtKpi(row.getCell(12).value),
        sl: fmtKpi(row.getCell(13).value),
      })
    }
  }
  return linhas
}

function ocrVariants(placa) {
  const swaps = [['0','O'],['1','I'],['1','J'],['5','S'],['8','B'],['3','E'],['6','G'],['E','3']]
  const alts = new Set()
  for (const [a, b] of swaps) {
    alts.add(placa.replace(new RegExp(a, 'g'), b))
    alts.add(placa.replace(new RegExp(b, 'g'), a))
  }
  alts.delete(placa)
  return [...alts]
}

async function main() {
  // Carregar manual (fonte de verdade das placas por loja)
  const manual = await lerKpiCompleto('C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-20.xlsx')
  const geradoLinhas = await lerKpiCompleto('C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-20 (5).xlsx')

  // Indexar gerado por loja+slot
  const geradoIdx = {}
  for (const g of geradoLinhas) {
    geradoIdx[g.loja + '|' + g.slot] = g
  }

  // Coletar todas as placas (manual + gerado) com variantes OCR
  const todasPlacas = new Set()
  for (const l of [...manual, ...geradoLinhas]) {
    if (l.placa) {
      todasPlacas.add(l.placa)
      ocrVariants(l.placa).forEach(v => todasPlacas.add(v))
    }
  }

  // Buscar paradas do DB para todas as placas
  const { data: paradas, error } = await sb
    .from('unitrac_paradas')
    .select('placa_norm, chegada, saida, duracao_seg, local_parada, codigo_loja, nome_loja, classificacao')
    .in('placa_norm', [...todasPlacas])
    .gte('chegada', DATA + 'T00:00:00.000Z')
    .lte('chegada', DATA + 'T23:59:59.999Z')
    .order('chegada')
  if (error) throw new Error('DB: ' + error.message)
  process.stderr.write(`Paradas no DB: ${paradas.length}\n`)

  // Agrupar por placa
  const gpsByPlaca = {}
  for (const p of paradas) {
    if (!gpsByPlaca[p.placa_norm]) gpsByPlaca[p.placa_norm] = []
    gpsByPlaca[p.placa_norm].push(p)
  }

  // Resolver placa → placa com GPS (incluindo variantes OCR)
  const resolveGps = placa => {
    if (!placa) return null
    if (gpsByPlaca[placa]) return placa
    return ocrVariants(placa).find(v => gpsByPlaca[v]) || null
  }

  console.log('=== ANÁLISE PLACA A PLACA — ZONA SUL 20/05/2026 ===')
  console.log('Legenda: SC=SaídaCD  CHD=ChegadaLoja  SL=SaídaLoja')
  console.log('         MANUAL vs GERADO(v5)')
  console.log('         GPS: B=BASE  L=LOJA  F=FORA_BASE\n')

  // Conjunto de placas já analisadas (para não repetir)
  const placasAnalisadas = new Set()
  const relatorio = []

  for (const m of manual) {
    const g = geradoIdx[m.loja + '|' + m.slot] || null

    const gpsPlaca = resolveGps(m.placa) || (g ? resolveGps(g.placa) : null)
    const ps = gpsPlaca ? (gpsByPlaca[gpsPlaca] || []) : []

    const pBase = ps.filter(p => p.classificacao === 'BASE')
    const pLoja = ps.filter(p => p.classificacao === 'LOJA')
    const pFora = ps.filter(p => p.classificacao === 'FORA_BASE')
    const ocrFix = gpsPlaca && m.placa && gpsPlaca !== m.placa

    const mVal = [m.sc || '---', m.chd || '---', m.sl || '---']
    const gVal = g ? [g.sc || '---', g.chd || '---', g.sl || '---'] : ['---', '---', '---']
    const diff = mVal.join('/') !== gVal.join('/')

    // diagnóstico
    let diagnostico = ''
    const mH = parseInt(mVal[1]?.split(':')[0] ?? '99')
    const gH = parseInt(gVal[1]?.split(':')[0] ?? '99')
    if (mVal[0] === 'SEM_RASTR' && gVal[0] !== '---' && gVal[0] !== 'SEM_RASTR' && gVal[0] !== 'NAO_FOI')
      diagnostico = 'MANUAL=SEM_RASTREADOR mas sistema gerou GPS. T18 falso positivo?'
    else if (gVal[0] === '---' && mVal[0] !== '---' && mVal[0] !== 'SEM_RASTR')
      diagnostico = 'Sistema vazio — GPS não achou esta loja (T18 não encontrou nada)'
    else if (!isNaN(mH) && !isNaN(gH) && mH >= 10 && gH < 8 && gH >= 0)
      diagnostico = `Sistema=madrugada(CHD ${gVal[1]}), manual=tarde(CHD ${mVal[1]}) — veículo 2 turnos`
    else if (!isNaN(mH) && !isNaN(gH) && mH < 8 && mH >= 0 && gH >= 10)
      diagnostico = `Sistema=tarde(CHD ${gVal[1]}), manual=madrugada(CHD ${mVal[1]})`
    else if (diff && mVal[1] !== '---' && gVal[1] !== '---' && mVal[0] !== 'SEM_RASTR')
      diagnostico = `Horário diferente SC:${mVal[0]}vs${gVal[0]} CHD:${mVal[1]}vs${gVal[1]}`

    relatorio.push({
      loja: m.loja, slot: m.slot, mot: m.mot,
      placa: m.placa, gpsPlaca, ocrFix,
      ps, pBase, pLoja, pFora,
      mVal, gVal, diff, diagnostico
    })

    if (m.placa) placasAnalisadas.add(m.placa)
  }

  // Mostrar relatório
  let nDiff = 0, nOk = 0, nSemGps = 0
  for (const r of relatorio) {
    if (r.diff) nDiff++; else nOk++
    if (!r.gpsPlaca) nSemGps++

    const tag = r.diff ? '[DIFF]' : '[OK]  '
    const gpsTag = !r.gpsPlaca
      ? 'GPS:NAO'
      : `GPS:SIM${r.ocrFix ? '(OCR→' + r.gpsPlaca + ')' : ''} [${r.ps.length}p | ${r.pBase.length}B ${r.pLoja.length}L ${r.pFora.length}F]`

    console.log(`\n${tag} [c${r.slot}] ${r.loja}`)
    console.log(`       ${r.mot || '?'} | ${r.placa || '?'} | ${gpsTag}`)

    // Últimas saídas de BASE (saída do CD)
    const saidasBase = r.pBase.filter(p => p.saida).slice(-3)
    for (const p of saidasBase) {
      const dur = Math.round((p.duracao_seg || 0) / 60)
      console.log(`       BASE   chg:${toHHMM(p.chegada)} → sai:${toHHMM(p.saida)}  dur:${dur}min  ${(p.local_parada||'').slice(0,40)}`)
    }

    // Paradas LOJA
    for (const p of r.pLoja) {
      const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
      console.log(`       LOJA   ${toHHMM(p.chegada)}-${toHHMM(p.saida)}  ${dur}  cod:${p.codigo_loja || '?'}  ${(p.nome_loja || p.local_parada || '').slice(0, 50)}`)
    }

    // Sem LOJA mas tem GPS
    if (r.gpsPlaca && r.pLoja.length === 0) {
      if (r.pFora.length > 0) {
        console.log(`       !! SEM LOJA — ${r.pFora.length}x FORA_BASE`)
        for (const p of r.pFora.slice(0, 3)) {
          console.log(`       FORA   ${toHHMM(p.chegada)}-${toHHMM(p.saida)}  ${(p.local_parada||'').slice(0,50)}`)
        }
      } else {
        console.log(`       !! SEM LOJA — só ${r.pBase.length}x BASE`)
      }
    }

    console.log(`       MANUAL : ${r.mVal.join(' / ')}`)
    console.log(`       GERADO : ${r.gVal.join(' / ')}`)
    if (r.diagnostico) console.log(`       >> ${r.diagnostico}`)
  }

  console.log('\n══════════════════════════════════════════════')
  console.log(`RESUMO: OK=${nOk}  DIFF=${nDiff}  SEM_GPS=${nSemGps}`)
  console.log('══════════════════════════════════════════════')
}

main().catch(e => { console.error('ERRO:', e.stack); process.exit(1) })
