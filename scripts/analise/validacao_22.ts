/**
 * Validação dia 22/05/2026 — roda matcher SEM comparar com KPI manual (não disponível ainda).
 * Foca em DETECTAR BUGS DE QUALIDADE no output do sistema:
 *  - GPS clonado (mesma parada atribuída a múltiplas linhas)
 *  - saida_cd ≈ chegada (impossível 0min de viagem)
 *  - Timestamps suspeitos (00:00-02:00 sem BASE coerente)
 *  - Rotas sem match (escala sem GPS)
 *
 * Uso: npx tsx scripts/analise/validacao_22.ts [REDE_ID]
 *   Sem REDE_ID: roda todas as redes.
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaGuanabaraPdf } from '@/lib/parsers/escala-guanabara-pdf'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22'
const DATA = '2026-05-22'

const REDE_FILTRO = process.argv[2]?.toUpperCase()

function toHHMM(iso: string | Date | null | undefined): string {
  if (!iso) return '---'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

function toEscalaRow(l: LinhaEscala, idx: number): EscalaLinhaRow {
  return {
    id: `fake-${idx}`,
    rede_id: l.rede_id,
    placa_norm: l.placa_norm,
    loja_nome_raw: l.loja_nome_raw,
    loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome,
    carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega,
    sub_rede: l.sub_rede ?? null,
  }
}

function toParadaRow(p: ParadaUnitrac, idx: number): UnitracParadaRow {
  return {
    id: `p-${idx}`,
    placa_norm: p.placa_norm,
    chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada),
    saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null),
    duracao_seg: p.duracao_seg ?? null,
    local_parada: p.local_parada ?? '',
    codigo_loja: p.codigo_loja ?? null,
    nome_loja: p.nome_loja ?? null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    classificacao: p.classificacao,
    ordem: p.ordem,
  }
}

async function carregarTodasEscalas(): Promise<LinhaEscala[]> {
  const todas: LinhaEscala[] = []

  // Geral (várias redes em 1 arquivo)
  try {
    const buf = readFileSync(BASE + '/ESCALA GERAL DE MAIO 0.xlsx')
    todas.push(...await parseEscalaGeral(buf, DATA))
  } catch (e: any) { process.stdout.write(`  AVISO geral: ${e.message}\n`) }

  // PAX/FEIRA_NOVA/EMANUEL
  try {
    const buf = readFileSync(BASE + '/ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx')
    todas.push(...await parseEscalaPax(buf, DATA))
  } catch (e: any) { process.stdout.write(`  AVISO pax: ${e.message}\n`) }

  // ARMAZEM_GRAO
  try {
    const buf = readFileSync(BASE + '/ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx')
    todas.push(...await parseEscalaArmazemGrao(buf, DATA))
  } catch (e: any) { process.stdout.write(`  AVISO armazem: ${e.message}\n`) }

  // ZONA_SUL
  try {
    const buf = readFileSync(BASE + '/ESCALA ZONA SUL - MAIO (8).xlsx')
    todas.push(...await parseEscalaZonaSul(buf, DATA))
  } catch (e: any) { process.stdout.write(`  AVISO zona sul: ${e.message}\n`) }

  return todas
}

async function main() {
  process.stdout.write(`\n=== VALIDAÇÃO ${DATA} ===\n\n`)

  process.stdout.write('Carregando escalas...\n')
  const escalaAll = await carregarTodasEscalas()
  process.stdout.write(`  Total: ${escalaAll.length} linhas\n`)

  const porRede = new Map<string, number>()
  for (const l of escalaAll) porRede.set(l.rede_id, (porRede.get(l.rede_id) ?? 0) + 1)
  process.stdout.write(`  Por rede: ${[...porRede.entries()].map(([r, c]) => `${r}=${c}`).join(' ')}\n\n`)

  const escalaFiltrada = REDE_FILTRO ? escalaAll.filter(l => l.rede_id === REDE_FILTRO) : escalaAll
  if (REDE_FILTRO && escalaFiltrada.length === 0) {
    process.stdout.write(`Nenhuma linha para rede=${REDE_FILTRO}\n`)
    process.exit(0)
  }
  const escala = escalaFiltrada.map(toEscalaRow)

  process.stdout.write('Carregando Unitrac (relatorio_9588.xlsx)...\n')
  const veiculos = await parseUnitrac(readFileSync(BASE + '/relatorio_9588.xlsx'))
  const paradasRaw: ParadaUnitrac[] = veiculos.flatMap(v => v.paradas)
  const paradas = paradasRaw.map(toParadaRow)
  process.stdout.write(`  ${veiculos.length} veículos, ${paradas.length} paradas\n`)

  process.stdout.write('Carregando lojas do DB...\n')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: lojasRaw, error: lojasErr } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)
  if (lojasErr) throw new Error(`lojas: ${lojasErr.message}`)
  const lojas: LojaRow[] = (lojasRaw ?? []) as LojaRow[]
  process.stdout.write(`  ${lojas.length} lojas\n\n`)

  process.stdout.write('Cruzando matcher...\n')
  const rotas = await cruzaEscalaUnitrac(escala, paradas, lojas)
  process.stdout.write(`  ${rotas.length} rotas geradas\n\n`)

  // === ANÁLISE DE QUALIDADE ===

  // 1. Estatísticas básicas
  const comGps = rotas.filter(r => r.paradas.length > 0)
  const semGps = rotas.filter(r => r.paradas.length === 0)
  const comSc = rotas.filter(r => r.saida_cd !== null)
  process.stdout.write(`=== ESTATÍSTICAS ===\n`)
  process.stdout.write(`  Rotas com GPS:        ${comGps.length}/${rotas.length}\n`)
  process.stdout.write(`  Rotas sem GPS:        ${semGps.length}/${rotas.length}\n`)
  process.stdout.write(`  Rotas com saída_cd:   ${comSc.length}/${rotas.length}\n\n`)

  // 2. BUG: saida_cd == chegada da primeira parada (impossível 0min de viagem)
  process.stdout.write(`=== BUG-CHECK: SC=CHD (impossível) ===\n`)
  const scIgualChegada = comGps.filter(r => {
    if (!r.saida_cd || !r.paradas[0]) return false
    const scTs = new Date(r.saida_cd).getTime()
    const chTs = new Date(r.paradas[0].chegada).getTime()
    return Math.abs(scTs - chTs) < 60_000 // <1 min de diferença = bug
  })
  if (scIgualChegada.length === 0) process.stdout.write(`  ✓ Nenhum caso\n\n`)
  else {
    process.stdout.write(`  ✗ ${scIgualChegada.length} casos:\n`)
    for (const r of scIgualChegada.slice(0, 10)) {
      const l = escala.find(e => e.id === r.escala_linha_id)
      process.stdout.write(`     ${l?.rede_id ?? '?'} | ${l?.placa_norm ?? '?'} | ${l?.loja_nome_raw ?? '?'} | SC=${toHHMM(r.saida_cd)} CHD=${toHHMM(r.paradas[0].chegada)}\n`)
    }
    if (scIgualChegada.length > 10) process.stdout.write(`     ... +${scIgualChegada.length - 10}\n`)
    process.stdout.write('\n')
  }

  // 3. BUG: GPS clonado (mesma parada atribuída a múltiplas linhas)
  process.stdout.write(`=== BUG-CHECK: GPS clonado (mesma parada → várias linhas) ===\n`)
  const paradaUso = new Map<string, { linhas: string[]; lojas: string[]; placa: string }>()
  for (const r of rotas) {
    const l = escala.find(e => e.id === r.escala_linha_id)
    for (const p of r.paradas) {
      const entry = paradaUso.get(p.parada_id) ?? { linhas: [], lojas: [], placa: l?.placa_norm ?? '?' }
      entry.linhas.push(r.escala_linha_id)
      entry.lojas.push(l?.loja_nome_raw ?? '?')
      paradaUso.set(p.parada_id, entry)
    }
  }
  const clonadas = [...paradaUso.entries()].filter(([_id, u]) => u.linhas.length > 1)
  if (clonadas.length === 0) process.stdout.write(`  ✓ Nenhum caso\n\n`)
  else {
    process.stdout.write(`  ${clonadas.length} paradas compartilhadas (verifique se são legítimas — ex. ARMAZEM_GRAO):\n`)
    for (const [id, u] of clonadas.slice(0, 8)) {
      process.stdout.write(`     ${id} (placa=${u.placa}, ${u.linhas.length}x): ${u.lojas.join(', ').slice(0, 100)}\n`)
    }
    if (clonadas.length > 8) process.stdout.write(`     ... +${clonadas.length - 8}\n`)
    process.stdout.write('\n')
  }

  // 4. BUG: CHD < 03:00 sem BASE coerente (timestamps suspeitos)
  process.stdout.write(`=== BUG-CHECK: CHD madrugada (00:00-03:00) ===\n`)
  const madrugada = comGps.filter(r => {
    if (!r.paradas[0]) return false
    const h = new Date(r.paradas[0].chegada).getUTCHours()
    return h >= 0 && h < 3
  })
  if (madrugada.length === 0) process.stdout.write(`  ✓ Nenhum caso\n\n`)
  else {
    process.stdout.write(`  ${madrugada.length} casos (revisar se estacionamento noturno passou pelo filtro):\n`)
    for (const r of madrugada.slice(0, 10)) {
      const l = escala.find(e => e.id === r.escala_linha_id)
      process.stdout.write(`     ${l?.rede_id ?? '?'} | ${l?.placa_norm ?? '?'} | ${l?.loja_nome_raw ?? '?'} | CHD=${toHHMM(r.paradas[0].chegada)}-${toHHMM(r.paradas[0].saida)}\n`)
    }
    if (madrugada.length > 10) process.stdout.write(`     ... +${madrugada.length - 10}\n`)
    process.stdout.write('\n')
  }

  // 5. Resumo por rede
  process.stdout.write(`=== RESUMO POR REDE ===\n`)
  const redeStats = new Map<string, { total: number; gps: number; sc: number }>()
  for (const r of rotas) {
    const l = escala.find(e => e.id === r.escala_linha_id)
    if (!l) continue
    const s = redeStats.get(l.rede_id) ?? { total: 0, gps: 0, sc: 0 }
    s.total++
    if (r.paradas.length > 0) s.gps++
    if (r.saida_cd) s.sc++
    redeStats.set(l.rede_id, s)
  }
  for (const [rede, s] of [...redeStats.entries()].sort((a, b) => b[1].total - a[1].total)) {
    const pctGps = ((s.gps / s.total) * 100).toFixed(0)
    process.stdout.write(`  ${rede.padEnd(18)} ${s.total}t  ${s.gps}gps(${pctGps}%)  ${s.sc}sc\n`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
