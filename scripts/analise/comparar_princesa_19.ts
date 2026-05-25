/**
 * Compara KPI PRINCESA dia 19 manual (aba "19") vs gerado mais recente.
 * Para cada diferença, mostra o que tá no Unitrac PDF/XLSX da placa.
 */
import { readFileSync } from 'fs'
import { lerKpi, normLoja, type KpiLinha } from './_lib/ler-kpi'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

function fmt(d: Date | null | undefined): string {
  if (!d) return '---'
  return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0')
}

function toMin(h: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(h)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

;(async () => {
  console.log('Lendo KPI manual PRINCESA aba 19...')
  const manual = await lerKpi('C:/Users/media/Downloads/KPI PRINCESA (8).xlsx', '19')
  console.log(`Manual: ${manual.length} linhas`)

  console.log('Lendo KPI gerado PRINCESA dia 19 (8)...')
  const gerado = await lerKpi('C:/Users/media/Downloads/KPI-PRINCESA-2026-05-19 (8).xlsx')
  console.log(`Gerado: ${gerado.length} linhas`)

  // Carregar Unitrac (combinar XLSX + PDF)
  console.log('Carregando Unitrac XLSX + PDF...')
  const xlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  const pdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set()).catch(() => [])
  const veiculos = new Map<string, any>()
  for (const v of xlsx) veiculos.set(v.placa_norm, v)
  for (const v of pdf) {
    if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)
  }

  const manualByLoja = new Map<string, KpiLinha>(manual.map(l => [normLoja(l.loja), l]))
  const geradoByLoja = new Map<string, KpiLinha>(gerado.map(l => [normLoja(l.loja), l]))

  let okExato = 0
  let okTolerancia = 0
  let okSem = 0
  const diffs: Array<{loja:string, manual:KpiLinha, gerado:KpiLinha, motivo:string}> = []

  for (const [key, m] of manualByLoja) {
    const g = geradoByLoja.get(key)
    if (!g) continue

    const isSemRastrM = m.sc1 === 'SEM' || (m.sc1 === 'SEM' && (m.chd1 === 'RASTREADOR' || m.chd1 === 'SEM'))
    const isSemRastrG = g.sc1 === 'SEM' || (g.sc1.startsWith('SEM') && g.chd1.startsWith('SEM'))
    if (isSemRastrM && isSemRastrG) { okSem++; continue }

    const sameSC = m.sc1 === g.sc1
    const sameCHD = m.chd1 === g.chd1
    const sameSL = m.sl1 === g.sl1

    if (sameSC && sameCHD && sameSL) { okExato++; continue }

    // Verifica tolerância
    const toler = (a: string, b: string) => {
      if (a === b) return true
      const ma = toMin(a), mb = toMin(b)
      if (ma == null || mb == null) return false
      return Math.abs(ma - mb) <= 10
    }
    if (toler(m.sc1, g.sc1) && toler(m.chd1, g.chd1) && toler(m.sl1, g.sl1)) {
      okTolerancia++
      continue
    }

    diffs.push({ loja: m.loja, manual: m, gerado: g, motivo: 'DIFF' })
  }

  console.log(`\n═══ RESUMO ═══`)
  console.log(`✅ OK exato: ${okExato}`)
  console.log(`⏱️ OK tolerância ±10min: ${okTolerancia}`)
  console.log(`✅ OK ambos SEM RASTREADOR: ${okSem}`)
  console.log(`❌ DIFF reais: ${diffs.length}`)

  console.log(`\n═══ DETALHES POR LOJA (DIFF) ═══`)
  for (const { loja, manual: m, gerado: g } of diffs) {
    console.log(`\n──────────── ${loja} ────────────`)
    console.log(`  MANUAL:  placa=${m.placa1}  SC=${m.sc1} CHD=${m.chd1} SL=${m.sl1}`)
    console.log(`  GERADO:  placa=${g.placa1}  SC=${g.sc1} CHD=${g.chd1} SL=${g.sl1}`)

    // Pega placa (prefere a do manual; se = gerado, tanto faz)
    const placa = (m.placa1 || g.placa1).replace(/-/g, '').toUpperCase()
    const v = veiculos.get(placa)
    if (!v) { console.log(`  Unitrac: PLACA NÃO ENCONTRADA`); continue }

    const lojas = v.paradas.filter((p: any) => p.classificacao === 'LOJA').sort((a:any,b:any)=>+new Date(a.chegada)-+new Date(b.chegada))
    const bases = v.paradas.filter((p: any) => p.classificacao === 'BASE' || p.classificacao === 'FAKE_EXIT').sort((a:any,b:any)=>+new Date(a.chegada)-+new Date(b.chegada))

    if (bases.length > 0) {
      console.log(`  Unitrac BASE/FAKE: ${bases.length} paradas`)
      for (const b of bases.slice(0, 6)) {
        console.log(`    [${b.classificacao.padEnd(10)}] ${fmt(b.chegada)}-${fmt(b.saida)}`)
      }
    }
    if (lojas.length > 0) {
      console.log(`  Unitrac LOJA: ${lojas.length} paradas`)
      for (const p of lojas) {
        const dur = p.duracao_seg ? Math.round(p.duracao_seg/60)+'min' : '?'
        console.log(`    [LOJA] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur}) cod=${p.codigo_loja ?? '-'} | ${(p.nome_loja ?? p.local_parada ?? '').slice(0,60)}`)
      }
    } else {
      console.log(`  Unitrac LOJA: NENHUMA parada LOJA classificada`)
    }
  }
})()
