/**
 * Análise placa a placa via DB — Zona Sul 20/05/2026
 */
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

const sb = createClient(
  'https://luhwpsckvbctxynifryk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1aHdwc2NrdmJjdHh5bmlmcnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwMzE0MSwiZXhwIjoyMDk0Mjc5MTQxfQ.t4R0Rxs4l9VH6YoR-8aE6Bno7hRr86m6FQq35CaD6bQ'
)

const DATA = '2026-05-20'
const REDE = 'ZONA_SUL'

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

function cv(cell) {
  const v = cell?.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && v.richText) return v.richText.map(r => r.text).join('').trim()
  if (typeof v === 'object' && v.text) return String(v.text).trim()
  return String(v).trim()
}

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
    map[loja] = {
      placa1: cv(row.getCell(4)), sc1: gt(5), chd1: gt(6), sl1: gt(7),
      placa2: cv(row.getCell(10)), sc2: gt(11), chd2: gt(12), sl2: gt(13),
    }
  }
  return map
}

async function main() {
  // 1. Buscar escala_linhas do dia ZONA_SUL
  const { data: linhas, error: e1 } = await sb
    .from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega')
    .eq('rede_id', REDE)
    .eq('data_entrega', DATA)
    .order('loja_nome_raw')
  if (e1) throw new Error('escala_linhas: ' + e1.message)
  console.error(`escala_linhas: ${linhas.length} registros`)

  // 2. Coletar placas únicas
  const placas = [...new Set(linhas.map(l => l.placa_norm).filter(Boolean))]
  console.error(`Placas únicas: ${placas.length}`)

  // 3. Buscar todas as paradas do dia para essas placas
  const { data: paradas, error: e2 } = await sb
    .from('unitrac_paradas')
    .select('placa_norm, chegada, saida, duracao_seg, local_parada, codigo_loja, nome_loja, classificacao')
    .in('placa_norm', placas)
    .gte('chegada', DATA + 'T00:00:00.000Z')
    .lte('chegada', DATA + 'T23:59:59.999Z')
    .order('chegada')
  if (e2) throw new Error('unitrac_paradas: ' + e2.message)
  console.error(`Paradas no DB: ${paradas.length}`)

  // 3b. Buscar kpi_rotas geradas para cruzar o status
  const { data: rotas } = await sb
    .from('kpi_rotas')
    .select('escala_linha_id, saida_cd, chd_loja_1, saida_loja_1, status, match_placa_norm')
    .eq('data', DATA)
    .in('escala_linha_id', linhas.map(l => l.id))
  const rotaMap = {}
  for (const r of rotas || []) rotaMap[r.escala_linha_id] = r

  // Agrupar paradas por placa
  const paradaMap = {}
  for (const p of paradas) {
    if (!paradaMap[p.placa_norm]) paradaMap[p.placa_norm] = []
    paradaMap[p.placa_norm].push(p)
  }

  // 4. Carregar KPIs
  const [kpiM, kpiG] = await Promise.all([
    lerKpi('C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-20.xlsx'),
    lerKpi('C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-20 (5).xlsx'),
  ])

  // 5. Agrupar linhas por loja
  const lojaMap = {}
  for (const l of linhas) {
    const loja = l.loja_nome_raw
    if (!lojaMap[loja]) lojaMap[loja] = []
    lojaMap[loja].push({ ...l, loja_nome: loja, slot: l.carro_ordem, motorista: l.motorista_nome, motorista_codigo: '' })
  }

  console.log('=== ANÁLISE PLACA A PLACA — ZONA SUL 20/05/2026 ===\n')

  const stats = { ok: 0, diff: 0, semGps: 0, soLojaDb: 0 }

  for (const [loja, slots] of Object.entries(lojaMap)) {
    const km = kpiM[loja] || {}
    const kg = kpiG[loja] || {}

    for (const l of slots) {
      const placa = l.placa_norm
      const ps = paradaMap[placa] || []
      const pBase = ps.filter(p => p.classificacao === 'BASE')
      const pLoja = ps.filter(p => p.classificacao === 'LOJA')
      const pFora = ps.filter(p => p.classificacao === 'FORA_BASE')
      const temGps = ps.length > 0

      const slot = l.slot || 1
      const mArr = slot === 1
        ? [km.sc1 || '---', km.chd1 || '---', km.sl1 || '---']
        : [km.sc2 || '---', km.chd2 || '---', km.sl2 || '---']
      const gArr = slot === 1
        ? [kg.sc1 || '---', kg.chd1 || '---', kg.sl1 || '---']
        : [kg.sc2 || '---', kg.chd2 || '---', kg.sl2 || '---']

      const diff = mArr.join('/') !== gArr.join('/')
      if (diff) stats.diff++; else stats.ok++
      if (!temGps) stats.semGps++

      const tag = diff ? '[DIFF]' : '[OK]  '
      const gpsTag = !temGps
        ? 'GPS:NAO'
        : `GPS:SIM [${ps.length}p | ${pBase.length}B ${pLoja.length}L ${pFora.length}F]`

      console.log(`\n${tag} ${loja}  [c${slot}] ${l.motorista||'?'} | cod:${l.motorista_codigo||'?'} | ${placa} | ${gpsTag} | status:${l.rota_status||'?'}`)

      // últimas saídas de BASE
      const saidasBase = pBase.filter(p => p.saida).slice(-2)
      for (const p of saidasBase) {
        const dur = Math.round((p.duracao_seg || 0) / 60)
        console.log(`       BASE  chg:${toHHMM(p.chegada)} sai:${toHHMM(p.saida)} dur:${dur}min`)
      }

      // paradas LOJA
      for (const p of pLoja) {
        const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
        console.log(`       LOJA  ${toHHMM(p.chegada)}-${toHHMM(p.saida)} ${dur}  cod:${p.codigo_loja || '?'}  ${(p.nome_loja || p.local_parada || '').slice(0, 55)}`)
      }

      // sem LOJA mas tem GPS
      if (temGps && pLoja.length === 0) {
        if (pFora.length > 0) {
          console.log(`       !! SEM LOJA — ${pFora.length} FORA_BASE`)
          for (const p of pFora.slice(0, 4)) {
            console.log(`       FB    ${toHHMM(p.chegada)}-${toHHMM(p.saida)}  ${(p.local_parada || '').slice(0, 50)}`)
          }
        } else {
          console.log(`       !! SEM LOJA — só ${pBase.length}x BASE`)
        }
      }

      console.log(`       MANUAL : ${mArr.join(' / ')}`)
      console.log(`       GERADO : ${gArr.join(' / ')}`)

      // diagnóstico automático
      if (diff) {
        const mH1 = parseInt(mArr[1]?.split(':')[0] ?? '99')
        const gH1 = parseInt(gArr[1]?.split(':')[0] ?? '99')
        if (mArr[0] === 'SEM' && gArr[0] !== '---' && gArr[0] !== 'SEM')
          console.log(`       >> MANUAL=SEM_RASTREADOR mas sistema gerou GPS. Placa real ou T18?`)
        else if (gArr[0] === '---' && mArr[0] !== '---' && mArr[0] !== 'SEM')
          console.log(`       >> Sistema vazio, manual tem dados. GPS não achou esta loja.`)
        else if (!isNaN(mH1) && !isNaN(gH1) && mH1 >= 10 && gH1 < 8 && gH1 >= 0)
          console.log(`       >> Sistema=madrugada(${gArr[1]}), manual=tarde(${mArr[1]}). Veículo fez 2 turnos?`)
        else if (!isNaN(mH1) && !isNaN(gH1) && gH1 >= 10 && mH1 < 8 && mH1 >= 0)
          console.log(`       >> Sistema=tarde, manual=madrugada.`)
        else if (!isNaN(mH1) && !isNaN(gH1))
          console.log(`       >> Horário diferente: manual CHD=${mArr[1]} vs gerado CHD=${gArr[1]}`)
      }
    }
  }

  // lojas no KPI manual mas não na escala do DB
  console.log('\n=== LOJAS NO MANUAL SEM CORRESPONDÊNCIA NO DB ===')
  for (const loja of Object.keys(kpiM)) {
    if (!lojaMap[loja] && (kpiM[loja].sc1 !== '---' || kpiM[loja].chd1 !== '---')) {
      console.log(`  ${loja}  manual=${kpiM[loja].sc1}/${kpiM[loja].chd1}/${kpiM[loja].sl1}`)
    }
  }

  console.log(`\n=== RESUMO ===`)
  console.log(`OK:${stats.ok} | DIFF:${stats.diff} | SEM_GPS:${stats.semGps}`)
}

main().catch(e => { console.error('ERRO:', e.stack); process.exit(1) })
