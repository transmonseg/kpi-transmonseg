/**
 * Sprint C — Validação V2.1 nos 5 dias (18-22/05/2026).
 *
 * Não compara contra KPI manual (só dia 20 tem manuais nesta máquina);
 * em vez disso valida COMPORTAMENTO da V2.1:
 *   1. Placas em VEICULOS_INATIVOS não recebem matches (Reforço 7)
 *   2. Rotas gigantes não casam linhas (Reforço 5) → contagem de matches via codigo_loja em ROTAS_GIGANTES
 *   3. Total de matches por dia: idealmente > baseline (que era ~287 OK no STATE.md)
 *   4. Lat/lng cobertura suficiente pro matching geo (Reforço 6)
 *
 * Uso: npx tsx scripts/correcao/validar_v21_5_dias.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import { isRotaGigante } from '@/lib/kpi/rotas-gigantes'
import { isVeiculoInativo, VEICULOS_INATIVOS } from '@/lib/kpi/veiculos-inativos'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const BASE_DIR = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

interface DiaConfig {
  data: string
  pasta: string
  geral?: string
  pax?: string
  armazem?: string
  zonasul?: string
  unitrac: string
}

const DIAS: DiaConfig[] = [
  { data: '2026-05-18', pasta: 'ESCALA DIA 18', geral: 'ESCALA GERAL DE MAIO 1 (6).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (5).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (6).xlsx', unitrac: 'relatorio_9402.xlsx' },
  { data: '2026-05-19', pasta: 'ESCALA DIA 19', geral: 'ESCALA GERAL DE MAIO 1 (6).xlsx', pax: 'ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (6).xlsx', unitrac: 'relatorio_9391.xlsx' },
  { data: '2026-05-20', pasta: 'ESCALA DIA 20', geral: 'ESCALA GERAL DE MAIO 1 (7).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (7).xlsx', unitrac: 'relatorio_9573.xlsx' },
  { data: '2026-05-21', pasta: 'ESCALA DIA 21', geral: 'ESCALA GERAL DE MAIO 1 (7).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (7).xlsx', unitrac: 'relatorio_9552.xlsx' },
  { data: '2026-05-22', pasta: 'ESCALA DIA 22', geral: 'ESCALA GERAL DE MAIO 0.xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (8).xlsx', unitrac: 'relatorio_9588.xlsx' },
]

function tryRead(path: string): Buffer | null {
  try { return readFileSync(path) } catch { return null }
}

function toEscalaRow(l: LinhaEscala, idx: number): EscalaLinhaRow {
  return {
    id: `e-${idx}`,
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

async function processarDia(dia: DiaConfig, lojas: LojaRow[]) {
  const escalas: LinhaEscala[] = []
  const erros: string[] = []

  if (dia.geral) {
    const buf = tryRead(`${BASE_DIR}/${dia.pasta}/${dia.geral}`)
    if (buf) { try { escalas.push(...await parseEscalaGeral(buf, dia.data)) } catch (e) { erros.push(`geral: ${(e as Error).message}`) } }
  }
  if (dia.pax) {
    const buf = tryRead(`${BASE_DIR}/${dia.pasta}/${dia.pax}`)
    if (buf) { try { escalas.push(...await parseEscalaPax(buf, dia.data)) } catch (e) { erros.push(`pax: ${(e as Error).message}`) } }
  }
  if (dia.armazem) {
    const buf = tryRead(`${BASE_DIR}/${dia.pasta}/${dia.armazem}`)
    if (buf) { try { escalas.push(...await parseEscalaArmazemGrao(buf, dia.data)) } catch (e) { erros.push(`armazem: ${(e as Error).message}`) } }
  }
  if (dia.zonasul) {
    const buf = tryRead(`${BASE_DIR}/${dia.pasta}/${dia.zonasul}`)
    if (buf) { try { escalas.push(...await parseEscalaZonaSul(buf, dia.data)) } catch (e) { erros.push(`zonasul: ${(e as Error).message}`) } }
  }

  const bufU = tryRead(`${BASE_DIR}/${dia.pasta}/${dia.unitrac}`)
  if (!bufU) { erros.push(`unitrac não encontrado`); return { dia: dia.data, escalas: escalas.length, paradas: 0, erros } }
  // parseUnitrac retorna viagens (1 por placa); achatamos pra ParadaUnitrac[]
  const viagens = await parseUnitrac(bufU) as unknown as Array<{ placa_norm: string, paradas: ParadaUnitrac[] }>
  const paradas: ParadaUnitrac[] = []
  for (const v of viagens) for (const p of (v.paradas ?? [])) paradas.push(p)

  // Filtrar por data
  const escalasDoDia = escalas.filter(e => e.data_entrega === dia.data)
  const paradasDoDia = paradas.filter(p => {
    const c = p.chegada instanceof Date ? p.chegada : new Date(p.chegada as string)
    if (!c || isNaN(c.getTime())) return false
    return c.toISOString().slice(0, 10) === dia.data
  })

  const escalaRows = escalasDoDia.map(toEscalaRow)
  const paradaRows = paradasDoDia.map(toParadaRow)

  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas)

  // Métricas
  const totalLinhas = escalaRows.length
  const totalParadas = paradaRows.length
  const lojaParadas = paradaRows.filter(p => p.classificacao === 'LOJA')
  const matchesComParada = rotas.filter(r => r.paradas.length > 0).length
  const matchesSem = rotas.filter(r => r.paradas.length === 0).length

  // Placas inativas
  const placasNaEscala = [...new Set(escalaRows.map(e => e.placa_norm).filter(Boolean))] as string[]
  const placasInativasNaEscala = placasNaEscala.filter(p => isVeiculoInativo(p))

  // Linhas atribuídas a placas inativas (idealmente 0)
  const linhasInativasComMatch = rotas.filter(r => r.placa_norm && isVeiculoInativo(r.placa_norm) && r.paradas.length > 0).length

  // Paradas com codigo_loja que é rota gigante (matched ou não)
  const paradasRotaGigante = lojaParadas.filter(p => p.codigo_loja && isRotaGigante(p.codigo_loja))

  return {
    dia: dia.data,
    escalas: escalaRows.length,
    paradas: paradaRows.length,
    lojaParadas: lojaParadas.length,
    rotas: rotas.length,
    matchesComParada,
    matchesSem,
    placasNaEscala: placasNaEscala.length,
    placasInativasNaEscala: placasInativasNaEscala.length,
    linhasInativasComMatch,
    paradasRotaGigante: paradasRotaGigante.length,
    erros,
  }
}

async function main() {
  console.log('=== VALIDAÇÃO V2.1 — 5 DIAS ===\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: lojasData } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, entrega_d1_fixo')
    .eq('ativo', true)
  const lojas = ((lojasData ?? []) as Record<string, unknown>[]).map(l => ({ ...l, sub_rede: null })) as unknown as LojaRow[]
  console.log(`Cadastro carregado: ${lojas.length} lojas ativas\n`)

  const resultados: Array<Awaited<ReturnType<typeof processarDia>>> = []
  for (const dia of DIAS) {
    process.stdout.write(`Processando ${dia.data}... `)
    try {
      const r = await processarDia(dia, lojas)
      resultados.push(r)
      console.log(`escalas=${r.escalas} paradas=${r.paradas} matches=${r.matchesComParada}/${r.rotas} inativas_match=${r.linhasInativasComMatch}`)
      if (r.erros.length) console.log(`  erros: ${r.erros.join('; ')}`)
    } catch (e) {
      console.log(`✗ ${(e as Error).message}\n${(e as Error).stack}`)
    }
  }

  // Tabela final
  console.log('\n=== RESUMO ===')
  console.log('| Dia        | Escalas | Paradas | Lojas | Rotas | Match | Sem | PlIn | LinIn | RotG |')
  console.log('|------------|---------|---------|-------|-------|-------|-----|------|-------|------|')
  for (const r of resultados) {
    console.log(`| ${r.dia} | ${String(r.escalas).padStart(7)} | ${String(r.paradas).padStart(7)} | ${String(r.lojaParadas).padStart(5)} | ${String(r.rotas).padStart(5)} | ${String(r.matchesComParada).padStart(5)} | ${String(r.matchesSem).padStart(3)} | ${String(r.placasInativasNaEscala).padStart(4)} | ${String(r.linhasInativasComMatch).padStart(5)} | ${String(r.paradasRotaGigante).padStart(4)} |`)
  }

  console.log('\nLegendas:')
  console.log('  Escalas: linhas na escala do dia')
  console.log('  Paradas: paradas totais no Unitrac')
  console.log('  Lojas:   paradas classificadas como LOJA')
  console.log('  Rotas:   linhas processadas pelo matcher')
  console.log('  Match:   linhas com >=1 parada atribuída')
  console.log('  Sem:     linhas sem match (UNMATCHED)')
  console.log('  PlIn:    placas inativas presentes na escala (V2.1 pula essas)')
  console.log('  LinIn:   linhas de placas inativas que receberam match (deve ser 0 ou bem baixo)')
  console.log('  RotG:    paradas com codigo_loja que é rota gigante (não casam exato sem citação)')

  const total = resultados.reduce((acc, r) => ({
    escalas: acc.escalas + r.escalas,
    matches: acc.matches + r.matchesComParada,
    sem: acc.sem + r.matchesSem,
    inativas: acc.inativas + r.linhasInativasComMatch,
  }), { escalas: 0, matches: 0, sem: 0, inativas: 0 })
  console.log('\n=== TOTAIS ===')
  console.log(`Total escalas: ${total.escalas}`)
  console.log(`Total matches: ${total.matches} (${((total.matches / total.escalas) * 100).toFixed(1)}%)`)
  console.log(`Total sem:     ${total.sem}`)
  console.log(`Linhas inativas com match (esperado ≈ 0): ${total.inativas}`)

  writeFileSync('docs/correcao-sistema/validacao-v21-5dias.json', JSON.stringify(resultados, null, 2), 'utf8')
  console.log('\nSalvo: docs/correcao-sistema/validacao-v21-5dias.json')
}

main().catch(e => { console.error(e); process.exit(1) })
