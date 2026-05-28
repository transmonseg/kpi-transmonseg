/**
 * Investiga bugs específicos do dia 20.
 * Uso: npx tsx scripts/analise/_investiga_d20.ts <CASO>
 * CASOS: zs_sematch | atacadao | zs_loja08 | princesa_iguaba | superprix_verdun | prezunic_fonseca
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import * as XLSX from 'xlsx'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function fmtT(d: Date | string | null): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

async function carregarUnitrac(dia: string) {
  const pasta = `${BASE}/ESCALA DIA ${dia}`
  if (!existsSync(pasta)) return []
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  const veiculos: any[] = []
  if (xlsxFile) {
    const r = await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`))
    veiculos.push(...r)
  }
  if (pdfFile) {
    const r = await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => [])
    veiculos.push(...r)
  }
  return veiculos
}

const CASO = process.argv[2] || 'zs_sematch'

;(async () => {
  if (CASO === 'zs_sematch') {
    // Investiga ZS lojas SEM_MATCH dia 20: Loja 33/36/27/15/07
    // Hipótese: trucks carregados dia 19 entregaram de madrugada dia 20 → GPS está no dia 19
    console.log('═══ ZS SEM_MATCH dia 20 — buscando placas no dia 19 ═══\n')

    const pasta20 = `${BASE}/ESCALA DIA 20`
    const files = readdirSync(pasta20)
    const zsFile = files.find(f => /ZONA.*SUL/i.test(f) && f.endsWith('.xlsx'))
    if (!zsFile) { console.log('Não achei escala ZS dia 20'); return }

    const escala20 = await parseEscalaZonaSul(readFileSync(`${pasta20}/${zsFile}`), '2026-05-20')
    const zsLinhas20 = escala20.filter(l => l.rede_id === 'ZONA_SUL')

    // Lojas SEM_MATCH identificadas
    const LOJAS_SEM = ['33', '36', '27', '15', '07', '21', '01', '03', '26']
    const linhasSem = zsLinhas20.filter(l => {
      const n = l.loja_nome_raw?.match(/(\d+)/)
      return n && LOJAS_SEM.includes(n[1])
    })

    console.log('Escala ZS dia 20 — linhas SEM_MATCH:')
    for (const l of linhasSem) {
      console.log(`  ${l.loja_nome_raw?.padEnd(35)} placa=${l.placa_norm}  data_entrega=${l.data_entrega}`)
    }

    // Carrega GPS dia 19 e verifica se essas placas aparecem lá
    console.log('\nGPS dia 19 — paradas LOJA dessas placas:')
    const veic19 = await carregarUnitrac('19')
    const placas = new Set(linhasSem.map(l => l.placa_norm).filter(Boolean))
    for (const v of veic19) {
      if (!placas.has(v.placa_norm)) continue
      const lojas = v.paradas.filter((p: any) => p.classificacao === 'LOJA')
      console.log(`\n  Placa ${v.placa_norm} dia 19:`)
      for (const p of lojas.slice(0, 5)) {
        console.log(`    ${fmtT(p.chegada)} → ${fmtT(p.saida)}  local=${p.local_parada?.slice(0,40)}`)
      }
    }

    // Verifica GPS dia 20 para essas placas
    console.log('\nGPS dia 20 — paradas LOJA dessas placas:')
    const veic20 = await carregarUnitrac('20')
    for (const v of veic20) {
      if (!placas.has(v.placa_norm)) continue
      const lojas = v.paradas.filter((p: any) => p.classificacao === 'LOJA')
      console.log(`\n  Placa ${v.placa_norm} dia 20 (${lojas.length} paradas LOJA):`)
      for (const p of lojas.slice(0, 5)) {
        console.log(`    ${fmtT(p.chegada)} → ${fmtT(p.saida)}  local=${p.local_parada?.slice(0,40)}`)
      }
    }
  }

  else if (CASO === 'atacadao') {
    // Atacadão dia 20: Belford Roxo CHD errado (sys=06:23, man=04:50)
    console.log('═══ ATACADÃO dia 20 — Belford Roxo ═══\n')
    const { data: lojas } = await sb.from('lojas').select('*').eq('rede_id', 'ATACADAO')
    const belfordRoxo = lojas?.find(l => /belford/i.test(l.nome))
    console.log(`Loja: ${belfordRoxo?.nome}  lat=${belfordRoxo?.lat} lng=${belfordRoxo?.lng} raio=${belfordRoxo?.raio_metros}`)

    // Escala GERAL dia 20
    const pasta20 = `${BASE}/ESCALA DIA 20`
    const files = readdirSync(pasta20)
    const geralFile = files.find(f => /ESCALA GERAL/i.test(f) && f.endsWith('.xlsx'))
    if (!geralFile) { console.log('sem escala geral'); return }
    const escala = await parseEscalaGeral(readFileSync(`${pasta20}/${geralFile}`), '2026-05-20')
    const atLines = escala.filter(l => l.rede_id === 'ATACADAO')
    console.log('\nEscala ATACADAO dia 20:')
    for (const l of atLines) {
      console.log(`  ${l.loja_nome_raw?.padEnd(35)} placa=${l.placa_norm}`)
    }

    // GPS dia 20 — todas paradas do caminhão ATACADAO
    const veic20 = await carregarUnitrac('20')
    const atacPlacas = new Set(atLines.map(l => l.placa_norm).filter(Boolean))
    for (const v of veic20) {
      if (!atacPlacas.has(v.placa_norm)) continue
      console.log(`\nGPS placa ${v.placa_norm} — todas paradas:`)
      for (const p of v.paradas) {
        const dist = belfordRoxo?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-belfordRoxo.lat)*111000)**2 + ((p.lng-belfordRoxo.lng)*111000)**2)) : '?'
        console.log(`  ${fmtT(p.chegada)} → ${fmtT(p.saida)}  ${p.classificacao.padEnd(10)} local=${p.local_parada?.slice(0,35).padEnd(35)} dist_belford≈${dist}m`)
      }
    }
  }

  else if (CASO === 'zs_loja08') {
    // ZS Loja 08 Ipanema: sys=03:47 (madrugada) quando manual=15:35 (tarde)
    console.log('═══ ZS Loja 08 Ipanema dia 20 — falso positivo madrugada ═══\n')
    const { data: lojas } = await sb.from('lojas').select('*').eq('rede_id', 'ZONA_SUL')
    const loja08 = lojas?.find(l => /loja\s*08|08.*ipanema/i.test(l.nome))
    console.log(`Loja 08: ${loja08?.nome}  lat=${loja08?.lat} lng=${loja08?.lng} raio=${loja08?.raio_metros}`)

    const pasta20 = `${BASE}/ESCALA DIA 20`
    const files = readdirSync(pasta20)
    const zsFile = files.find(f => /ZONA.*SUL/i.test(f) && f.endsWith('.xlsx'))
    const escala = await parseEscalaZonaSul(readFileSync(`${pasta20}/${zsFile!}`), '2026-05-20')
    const loja08Lines = escala.filter(l => l.rede_id === 'ZONA_SUL' && /08/i.test(l.loja_nome_raw || ''))
    console.log('\nEscala ZS Loja 08 dia 20:')
    for (const l of loja08Lines) console.log(`  ${l.loja_nome_raw}  placa=${l.placa_norm}  data_entrega=${l.data_entrega}`)

    const veic20 = await carregarUnitrac('20')
    const placas = new Set(loja08Lines.map(l => l.placa_norm).filter(Boolean))
    for (const v of veic20) {
      if (!placas.has(v.placa_norm)) continue
      console.log(`\nGPS ${v.placa_norm} dia 20:`)
      for (const p of v.paradas) {
        const dist = loja08?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-loja08.lat)*111000)**2 + ((p.lng-loja08.lng)*111000)**2)) : '?'
        console.log(`  ${fmtT(p.chegada)} ${p.classificacao.padEnd(10)} local=${p.local_parada?.slice(0,30).padEnd(30)} dist_l08≈${dist}m`)
      }
    }
  }

  else if (CASO === 'princesa_iguaba') {
    console.log('═══ PRINCESA Iguaba dia 20 ═══\n')
    const { data: lojas } = await sb.from('lojas').select('*').eq('rede_id', 'PRINCESA')
    const iguaba = lojas?.find(l => /iguaba/i.test(l.nome))
    console.log(`Loja: ${iguaba?.nome}  lat=${iguaba?.lat} lng=${iguaba?.lng} raio=${iguaba?.raio_metros}`)

    const pasta20 = `${BASE}/ESCALA DIA 20`
    const files = readdirSync(pasta20)
    const geralFile = files.find(f => /ESCALA GERAL/i.test(f) && f.endsWith('.xlsx'))
    const escala = await parseEscalaGeral(readFileSync(`${pasta20}/${geralFile!}`), '2026-05-20')
    const princLines = escala.filter(l => l.rede_id === 'PRINCESA' && /iguaba/i.test(l.loja_nome_raw || ''))
    console.log('\nEscala PRINCESA Iguaba:')
    for (const l of princLines) console.log(`  ${l.loja_nome_raw}  placa=${l.placa_norm}`)

    const veic20 = await carregarUnitrac('20')
    const placas = new Set(princLines.map(l => l.placa_norm).filter(Boolean))
    for (const v of veic20) {
      if (!placas.has(v.placa_norm)) continue
      console.log(`\nGPS ${v.placa_norm} — paradas LOJA/FORA:`)
      for (const p of v.paradas.filter((p: any) => p.classificacao !== 'BASE' && p.classificacao !== 'FAKE_EXIT')) {
        const dist = iguaba?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-iguaba.lat)*111000)**2 + ((p.lng-iguaba.lng)*111000)**2)) : '?'
        console.log(`  ${fmtT(p.chegada)} ${p.classificacao.padEnd(10)} local=${p.local_parada?.slice(0,30).padEnd(30)} dist_iguaba≈${dist}m`)
      }
    }
  }

  else if (CASO === 'superprix_verdun') {
    console.log('═══ SUPERPRIX Grajaú VERDUN 2ª Entrega dia 20 ═══\n')
    console.log('man=09:50  sys=07:24 (146min off)')
    const { data: lojas } = await sb.from('lojas').select('*').eq('rede_id', 'SUPERPRIX')
    const verdun = lojas?.find(l => /verdun|grajau.*04|04.*grajau/i.test(l.nome))
    console.log(`Loja: ${verdun?.nome}  lat=${verdun?.lat} lng=${verdun?.lng} raio=${verdun?.raio_metros}`)

    const pasta20 = `${BASE}/ESCALA DIA 20`
    const files = readdirSync(pasta20)
    const paxFile = files.find(f => /PAX.*FEIRA|FEIRA.*PAX/i.test(f) && f.endsWith('.xlsx'))
    if (!paxFile) { console.log('sem escala PAX'); return }
    const { parseEscalaPax } = await import('@/lib/parsers/escala-pax')
    const escala = await parseEscalaPax(readFileSync(`${pasta20}/${paxFile}`), '2026-05-20')
    const spLines = escala.filter(l => l.rede_id === 'SUPERPRIX' && /verdun|loja.*04/i.test(l.loja_nome_raw || ''))
    console.log('\nEscala SUPERPRIX Verdun:')
    for (const l of spLines) console.log(`  ${l.loja_nome_raw}  placa=${l.placa_norm}`)

    const veic20 = await carregarUnitrac('20')
    const placas = new Set(spLines.map(l => l.placa_norm).filter(Boolean))
    for (const v of veic20) {
      if (!placas.has(v.placa_norm)) continue
      console.log(`\nGPS ${v.placa_norm}:`)
      for (const p of v.paradas.filter((p: any) => p.classificacao !== 'BASE')) {
        const dist = verdun?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-verdun.lat)*111000)**2 + ((p.lng-verdun.lng)*111000)**2)) : '?'
        console.log(`  ${fmtT(p.chegada)} → ${fmtT(p.saida)} ${p.classificacao.padEnd(10)} local=${p.local_parada?.slice(0,30).padEnd(30)} dist_verdun≈${dist}m`)
      }
    }
  }

  else if (CASO === 'prezunic_fonseca') {
    console.log('═══ PREZUNIC Fonseca dia 20 — CHD Δ=8min SL 239min ═══\n')
    console.log('man=05:35/09:30  sys=05:27/05:31 (4min stop!)')
    const { data: lojas } = await sb.from('lojas').select('*').eq('rede_id', 'PREZUNIC')
    const fonseca = lojas?.find(l => /fonseca/i.test(l.nome))
    console.log(`Loja: ${fonseca?.nome}  lat=${fonseca?.lat} lng=${fonseca?.lng} raio=${fonseca?.raio_metros}`)

    const pasta20 = `${BASE}/ESCALA DIA 20`
    const files = readdirSync(pasta20)
    const geralFile = files.find(f => /ESCALA GERAL/i.test(f) && f.endsWith('.xlsx'))
    const escala = await parseEscalaGeral(readFileSync(`${pasta20}/${geralFile!}`), '2026-05-20')
    const fLines = escala.filter(l => l.rede_id === 'PREZUNIC' && /fonseca/i.test(l.loja_nome_raw || ''))
    console.log('\nEscala PREZUNIC Fonseca:')
    for (const l of fLines) console.log(`  ${l.loja_nome_raw}  placa=${l.placa_norm}`)

    const veic20 = await carregarUnitrac('20')
    const placas = new Set(fLines.map(l => l.placa_norm).filter(Boolean))
    for (const v of veic20) {
      if (!placas.has(v.placa_norm)) continue
      console.log(`\nGPS ${v.placa_norm} — todas paradas 04:00-11:00:`)
      for (const p of v.paradas) {
        const h = new Date(p.chegada).getUTCHours()
        if (h < 4 || h > 11) continue
        const dist = fonseca?.lat && p.lat ? Math.round(Math.sqrt(((p.lat-fonseca.lat)*111000)**2 + ((p.lng-fonseca.lng)*111000)**2)) : '?'
        console.log(`  ${fmtT(p.chegada)} → ${fmtT(p.saida)} ${p.classificacao.padEnd(10)} dur=${Math.round((p.duracao_seg||0)/60)}min local=${p.local_parada?.slice(0,30).padEnd(30)} dist_fonseca≈${dist}m`)
      }
    }
  }
})()
