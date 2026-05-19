/**
 * Teste end-to-end do pipeline: parsers → cruzaEscalaUnitrac → detectaAnomalias
 * Executa com: npx tsx scripts/test-pipeline.ts
 */
import { readFileSync } from 'fs'
import path from 'path'

const BASE_ESCALA = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/escalas'
const BASE_UNITRAC = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/relatorios-unitrac'
const SUPABASE_URL = 'https://luhwpsckvbctxynifryk.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1aHdwc2NrdmJjdHh5bmlmcnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwMzE0MSwiZXhwIjoyMDk0Mjc5MTQxfQ.t4R0Rxs4l9VH6YoR-8aE6Bno7hRr86m6FQq35CaD6bQ'

import { parseEscalaZonaSul } from '../src/lib/parsers/escala-zona-sul'
import { parseEscalaGeral } from '../src/lib/parsers/escala-geral'
import { parseEscalaArmazemGrao } from '../src/lib/parsers/escala-armazem-grao'
import { parseEscalaPax } from '../src/lib/parsers/escala-pax'
import { parseUnitrac } from '../src/lib/parsers/unitrac'
import { cruzaEscalaUnitrac } from '../src/lib/kpi/matcher'
import { detectaAnomalias } from '../src/lib/kpi/anomalia'

const svcHeaders = {
  apikey: SERVICE_KEY,
  Authorization: 'Bearer ' + SERVICE_KEY,
  'Content-Type': 'application/json',
}

async function dbGet(table: string, params = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: svcHeaders })
  return r.json() as Promise<Record<string, unknown>[]>
}

async function log(msg: string) { process.stdout.write(msg + '\n') }

function sep(label: string) { log(`\n${'─'.repeat(60)}\n${label}\n${'─'.repeat(60)}`) }

;(async () => {
  // ── 1. Parsers de escala ─────────────────────────────────────────────────
  sep('1. PARSERS DE ESCALA')

  const DATA = '2026-05-14'

  const zonaSulBuf = readFileSync(path.join(BASE_ESCALA, 'ESCALA ZONA SUL - MAIO.xlsx'))
  const geralBuf   = readFileSync(path.join(BASE_ESCALA, 'ESCALA GERAL DE MAIO 1.xlsx'))
  const graoBuf    = readFileSync(path.join(BASE_ESCALA, 'ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx'))
  const paxBuf     = readFileSync(path.join(BASE_ESCALA, 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO.xlsx'))

  const [zonaSulLinhas, geralLinhas, graoLinhas, paxLinhas] = await Promise.all([
    parseEscalaZonaSul(zonaSulBuf, DATA),
    parseEscalaGeral(geralBuf, DATA),
    parseEscalaArmazemGrao(graoBuf, DATA),
    parseEscalaPax(paxBuf, DATA),
  ])

  log(`Zona Sul  [${DATA}]: ${zonaSulLinhas.length} linhas`)
  if (zonaSulLinhas.length > 0) {
    log('  Amostra:')
    zonaSulLinhas.slice(0, 3).forEach(l =>
      log(`    loja=${l.loja_nome_raw} placa=${l.placa_norm} placa_raw=${l.placa_raw} motorista=${l.motorista_nome} cod=${l.motorista_codigo}`)
    )
    const placasUnicas = [...new Set(zonaSulLinhas.map(l => l.placa_norm).filter(Boolean))]
    log(`  Placas únicas (${placasUnicas.length}): ${placasUnicas.slice(0, 10).join(', ')}`)
  }

  log(`\nEscala Geral [${DATA}]: ${geralLinhas.length} linhas`)
  if (geralLinhas.length > 0) {
    const redeCount: Record<string, number> = {}
    geralLinhas.forEach(l => { redeCount[l.rede_id] = (redeCount[l.rede_id] ?? 0) + 1 })
    Object.entries(redeCount).sort((a,b) => b[1]-a[1]).forEach(([r, c]) => log(`    ${r}: ${c}`))
  }

  log(`\nArmazém do Grão [${DATA}]: ${graoLinhas.length} linhas`)
  if (graoLinhas.length > 0) {
    graoLinhas.slice(0, 3).forEach(l =>
      log(`    loja=${l.loja_nome_raw} placa=${l.placa_norm} motorista=${l.motorista_nome}`)
    )
  }

  log(`\nPAX/Feira Nova/Emanuel [${DATA}]: ${paxLinhas.length} linhas`)
  if (paxLinhas.length > 0) {
    const redeCount: Record<string, number> = {}
    paxLinhas.forEach(l => { redeCount[l.rede_id] = (redeCount[l.rede_id] ?? 0) + 1 })
    Object.entries(redeCount).forEach(([r, c]) => log(`    ${r}: ${c}`))
  }

  // ── 2. Parser Unitrac ────────────────────────────────────────────────────
  sep('2. PARSER UNITRAC (DIA14)')

  const unitracBuf = readFileSync(path.join(BASE_UNITRAC, 'relatorio_unitrac_9086_DIA14.xlsx'))
  const unitracResult = await parseUnitrac(unitracBuf)

  log(`Veículos: ${unitracResult.length}`)
  const totalParadas = unitracResult.reduce((s, v) => s + v.paradas.length, 0)
  const lojaParadas = unitracResult.reduce((s, v) => s + v.paradas.filter(p => p.classificacao === 'LOJA').length, 0)
  log(`Total paradas: ${totalParadas} | Paradas LOJA: ${lojaParadas}`)

  const amostraVeic = unitracResult.slice(0, 3)
  amostraVeic.forEach(v => {
    const lojas = v.paradas.filter(p => p.classificacao === 'LOJA')
    log(`  ${v.placa_norm}: ${v.paradas.length} paradas, ${lojas.length} lojas — ${lojas.map(p => p.codigo_loja + '/' + (p.nome_loja ?? '?')).join(', ').substring(0, 80)}`)
  })

  // ── 3. Cruz: PRINCESA (está na Escala Geral) ─────────────────────────────
  sep('3. CRUZAMENTO — PRINCESA (Escala Geral × Unitrac)')

  const lojas = await dbGet('lojas', 'select=id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros&ativo=eq.true')
  log(`Lojas no DB: ${lojas.length}`)

  const princLojas = lojas.filter(l => l.rede_id === 'PRINCESA')
  const princLinhas = geralLinhas.filter(l => l.rede_id === 'PRINCESA')
  log(`Linhas PRINCESA: ${princLinhas.length}`)

  if (princLinhas.length > 0) {
    const placasPrinc = [...new Set(princLinhas.map(l => l.placa_norm).filter(Boolean))]
    const unitracParadas = unitracResult
      .filter(v => placasPrinc.includes(v.placa_norm))
      .flatMap(v => v.paradas)

    log(`Placas PRINCESA: ${placasPrinc.join(', ')}`)
    log(`Paradas Unitrac para essas placas: ${unitracParadas.length}`)

    // Build paradasIndex
    const paradasIndex = new Map<string, Array<{id: string; classificacao: string; chegada: Date; saida: Date | null; duracao_seg: number | null; lat: number | null; lng: number | null}>>()
    for (const p of unitracParadas) {
      const list = paradasIndex.get(p.placa_norm) ?? []
      list.push({ id: String(Math.random()), classificacao: p.classificacao, chegada: p.chegada, saida: p.saida, duracao_seg: p.duracao_seg, lat: p.lat, lng: p.lng })
      paradasIndex.set(p.placa_norm, list)
    }

    const rotas = cruzaEscalaUnitrac(princLinhas, unitracParadas.map(p => ({
      id: String(Math.random()), placa_norm: p.placa_norm, chegada: p.chegada.toISOString(),
      saida: p.saida?.toISOString() ?? null, duracao_seg: p.duracao_seg, distancia_km: null,
      endereco: null, lat: p.lat, lng: p.lng, local_parada: p.local_parada,
      codigo_loja: p.codigo_loja, nome_loja: p.nome_loja, classificacao: p.classificacao,
      ordem: p.ordem, unitrac_uploads: { data_relatorio: DATA }
    })), princLojas as Parameters<typeof cruzaEscalaUnitrac>[2])

    log(`Rotas cruzadas: ${rotas.length}`)
    let comParadas = 0, semParadas = 0
    rotas.forEach(r => {
      const lojaParadas = r.paradas.filter(p => p.classificacao === 'LOJA')
      if (lojaParadas.length > 0) comParadas++; else semParadas++
    })
    log(`  Com paradas de loja: ${comParadas} | Sem paradas: ${semParadas}`)

    rotas.slice(0, 3).forEach(r => {
      const lojaPs = r.paradas.filter(p => p.classificacao === 'LOJA')
      log(`  ${r.placa_norm} (${r.escala_linha_id?.substring(0,8)}): ${lojaPs.length} lojas — saida_cd=${r.saida_cd?.toISOString() ?? 'null'}`)
    })

    // Anomalias
    const redes = await dbGet('redes', 'select=id,janela_inicio,janela_fim')
    const janelasRede = new Map(redes.filter(r => r.janela_inicio && r.janela_fim).map(r => [r.id as string, { janela_inicio: r.janela_inicio as string, janela_fim: r.janela_fim as string }]))

    const anomalias = detectaAnomalias({ rotas, escalaLinhas: princLinhas, paradasIndex, janelasRede, data: DATA })
    log(`\nAnomalias PRINCESA: ${anomalias.length}`)
    const byCodigo: Record<string, number> = {}
    anomalias.forEach(a => { byCodigo[a.codigo] = (byCodigo[a.codigo] ?? 0) + 1 })
    Object.entries(byCodigo).sort((a,b) => b[1]-a[1]).forEach(([c, n]) => log(`  ${c}: ${n}`))
  }

  // ── 4. Cruz: ZONA_SUL ────────────────────────────────────────────────────
  sep('4. CRUZAMENTO — ZONA_SUL (Escala × Unitrac)')

  const zsLojas = lojas.filter(l => l.rede_id === 'ZONA_SUL')
  log(`Linhas ZONA_SUL [${DATA}]: ${zonaSulLinhas.length}`)
  log(`Lojas ZONA_SUL no DB: ${zsLojas.length}`)

  if (zonaSulLinhas.length > 0) {
    const placasZS = [...new Set(zonaSulLinhas.map(l => l.placa_norm).filter(Boolean))]
    const unitracZS = unitracResult.filter(v => placasZS.includes(v.placa_norm))
    log(`Placas ZONA_SUL na escala: ${placasZS.join(', ')}`)
    log(`Placas encontradas no Unitrac: ${unitracZS.map(v => v.placa_norm).join(', ')}`)

    const unitracZSParadas = unitracZS.flatMap(v => v.paradas)
    const rotas = cruzaEscalaUnitrac(zonaSulLinhas, unitracZSParadas.map(p => ({
      id: String(Math.random()), placa_norm: p.placa_norm, chegada: p.chegada.toISOString(),
      saida: p.saida?.toISOString() ?? null, duracao_seg: p.duracao_seg, distancia_km: null,
      endereco: null, lat: p.lat, lng: p.lng, local_parada: p.local_parada,
      codigo_loja: p.codigo_loja, nome_loja: p.nome_loja, classificacao: p.classificacao,
      ordem: p.ordem, unitrac_uploads: { data_relatorio: DATA }
    })), zsLojas as Parameters<typeof cruzaEscalaUnitrac>[2])

    log(`Rotas cruzadas: ${rotas.length}`)
    rotas.slice(0, 5).forEach(r => {
      const lojaPs = r.paradas.filter(p => p.classificacao === 'LOJA')
      log(`  placa=${r.placa_norm} escala_loja=${r.paradas[0]?.nome ?? '?'} lojaParadas=${lojaPs.length} saida_cd=${r.saida_cd?.toISOString().substring(11,19) ?? 'null'}`)
    })
  }

  // ── 5. Resumo ────────────────────────────────────────────────────────────
  sep('5. RESUMO')

  const totalLinhas = zonaSulLinhas.length + geralLinhas.length + graoLinhas.length + paxLinhas.length
  log(`Total linhas parseadas [${DATA}]: ${totalLinhas}`)
  log(`  Zona Sul:   ${zonaSulLinhas.length}`)
  log(`  Geral:      ${geralLinhas.length}`)
  log(`  Grão:       ${graoLinhas.length}`)
  log(`  PAX/etc:    ${paxLinhas.length}`)
  log(`Unitrac DIA14: ${unitracResult.length} veículos, ${unitracResult.reduce((s,v)=>s+v.paradas.length,0)} paradas`)

  const redesEscala = [...new Set([...zonaSulLinhas, ...geralLinhas, ...graoLinhas, ...paxLinhas].map(l => l.rede_id))]
  log(`Redes na escala: ${redesEscala.join(', ')}`)

  log('\n✅ Pipeline OK\n')
})().catch(e => { console.error('ERRO:', e.message, e.stack?.split('\n').slice(0,5).join('\n')); process.exit(1) })
