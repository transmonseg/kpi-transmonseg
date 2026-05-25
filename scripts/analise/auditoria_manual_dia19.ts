// AUDITORIA MANUAL DIA 19 — cruzamento total
// Pra cada linha escala ARMAZEM, lista TODAS as paradas da placa (todas classificações)
// Pra cada parada, calcula distância pra TODAS as lojas ARMAZEM cadastradas
// Identifica parada que provavelmente é a entrega manual (horário + duração)

import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(lat2-lat1); const dLon = toRad(lon2-lon1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Manual da Tia Érica — dia 19 (do KPI ARMAZEM DO GRAO.xlsx aba 19)
const MANUAL: Record<string, { sc: string; chd: string; sl: string }> = {
  'REGINA  BARRA DO IMBUY':         { sc: '12:40', chd: '15:40', sl: '16:25' },
  'REGINA  1 DE MAIO':              { sc: '12:40', chd: '14:20', sl: '14:30' },
  'REGINA  LUCIO MEIRA':            { sc: '12:40', chd: '14:35', sl: '14:55' },
  'ABASTECEDORA GRÃO DA SERRA (ALTO)': { sc: '12:40', chd: '15:05', sl: '15:25' },
  'ARMAZÉM DO GRÃO ( BOA VISTA)':   { sc: '14:15', chd: '15:30', sl: '15:55' },
  'ARMAZÉM DO GRÃO MATRIZ ( POSSE)':{ sc: '14:15', chd: '16:50', sl: '17:55' },
  'ARMAZEM DO GRÃO (ITAIPAVA)':     { sc: '12:40', chd: '14:10', sl: '14:20' },
  'ARMAZEM DO GRAO (CORREAS)':      { sc: '12:40', chd: '14:30', sl: '14:45' },
  'ARMAZEM DO GRÃO (VALPARAÍSO)':   { sc: '13:50', chd: '15:25', sl: '15:45' },
  'ARMAZEM DO GRÃO  (MOSELA)':      { sc: '13:50', chd: '16:00', sl: '16:30' },
  'ARMAZEM DO GRÃO (QUITANDINHA)':  { sc: '13:50', chd: '15:00', sl: '15:20' },
  'ARMAZEM DO GRÃO (CAPELA)':       { sc: '13:10', chd: '15:30', sl: '16:00' },
  'ARMAZEM DO GRAO (16 DE MARÇO)':  { sc: '13:10', chd: '16:00', sl: '16:20' },
  'ARMAZEM DO GRAO A. BARRA DA TIJUCA': { sc: '13:15', chd: '14:10', sl: '14:40' },
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

;(async () => {
  const escala = await parseEscalaArmazemGrao(readFileSync(BASE + '/ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx'), '2026-05-19')
  const armazem = escala.filter(l => l.rede_id === 'ARMAZEM_GRAO')

  const xlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  const pdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set()).catch(() => [])
  const veiculos = new Map<string, any>()
  for (const v of xlsx) veiculos.set(v.placa_norm, v)
  for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)

  // Cadastro atual
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojas } = await sb
    .from('lojas')
    .select('id, rede_id, nome, codigo_escala, codigo_unitrac, lat, lng, raio_metros')
    .eq('rede_id', 'ARMAZEM_GRAO')
    .eq('ativo', true)

  // Agrupa escala por placa
  const escalaByPlaca = new Map<string, typeof armazem>()
  for (const l of armazem) {
    if (!l.placa_norm) continue
    const arr = escalaByPlaca.get(l.placa_norm) ?? []
    arr.push(l)
    escalaByPlaca.set(l.placa_norm, arr)
  }

  for (const [placa, linhas] of escalaByPlaca) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`PLACA: ${placa}  motorista: ${linhas[0].motorista_nome ?? '?'}`)
    console.log(`Escala (${linhas.length} lojas):`)
    for (const l of linhas) {
      const m = MANUAL[l.loja_nome_raw]
      console.log(`  • ${l.loja_nome_raw.padEnd(45)}  manual: SC=${m?.sc ?? '?'} CHD=${m?.chd ?? '?'} SL=${m?.sl ?? '?'}`)
    }

    const v = veiculos.get(placa)
    if (!v) { console.log(`\nGPS: AUSENTE no Unitrac`); continue }
    const paradas = [...v.paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))
    console.log(`\nGPS (${paradas.length} paradas):`)
    for (const p of paradas) {
      const dur = p.duracao_seg ? Math.round(p.duracao_seg/60) + 'min' : '?'
      // Distância para cada loja da escala desta placa
      const distInfo: string[] = []
      for (const l of linhas) {
        const lj = lojas?.find(x => {
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim()
          return norm(x.nome) === norm(l.loja_nome_raw)
        })
        if (!lj?.lat || !lj?.lng || p.lat == null || p.lng == null) continue
        const d = haversine(p.lat, p.lng, lj.lat, lj.lng)
        const tag = d <= lj.raio_metros ? '✓' : d < 1000 ? '~' : '·'
        distInfo.push(`${tag}${d < 1000 ? Math.round(d)+'m' : (d/1000).toFixed(1)+'km'}→${l.loja_nome_raw.match(/(\w+)$/)?.[1] ?? '?'}`)
      }
      console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur.padStart(6)})  ${(p.lat ?? 0).toFixed(5)},${(p.lng ?? 0).toFixed(5)}  ${distInfo.join(' ')}`)
      if (p.codigo_loja || p.nome_loja) console.log(`    cod=${p.codigo_loja ?? '-'} | ${(p.local_parada ?? '').slice(0,55)}`)
    }

    // Análise: pra cada loja escala, sugere parada GPS mais provável (por horário)
    console.log(`\nAnálise (horário manual vs paradas GPS):`)
    for (const l of linhas) {
      const m = MANUAL[l.loja_nome_raw]
      if (!m) continue
      const chdMin = timeToMin(m.chd)
      const slMin = timeToMin(m.sl)
      // Acha parada com chegada mais próxima do manual.chd
      let melhor: any = null
      let melhorDelta = Infinity
      for (const p of paradas) {
        const h = new Date(p.chegada).getUTCHours()
        const min = new Date(p.chegada).getUTCMinutes()
        const pMin = h * 60 + min
        const delta = Math.abs(pMin - chdMin)
        if (delta < melhorDelta) { melhorDelta = delta; melhor = p }
      }
      if (melhor) {
        console.log(`  ${l.loja_nome_raw.padEnd(45)} manual CHD=${m.chd} → mais próxima: ${fmt(melhor.chegada)}-${fmt(melhor.saida)} [${melhor.classificacao}] coord ${(melhor.lat ?? 0).toFixed(5)},${(melhor.lng ?? 0).toFixed(5)} (Δ ${melhorDelta}min)`)
      }
    }
  }
})()
