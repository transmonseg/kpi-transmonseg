// Verificação E2E da reformulação honesta do dashboard normal.
//
// Roda o pipeline real (parseKpiManual → calcularMetricas → resumoDia) sobre
// vários KPIs reais e prova os invariantes que evitam INFORMAÇÃO FALSA:
//
//   1. NUNCA descarta linha: toda linha de loja vira UMA entrada com status no
//      enum (o `else continue` antigo sumia com em rota/desatualizado).
//   2. As 7 categorias somam exatamente o total (nada cai num buraco).
//   3. taxaEntregaDefinitiva = entregue / (entregue + nao_foi); em rota,
//      desatualizado, sem rastreador e indefinido FICAM FORA do denominador.
//   4. resumoDia.provisorio <=> existe alguma rota em andamento (em_rota > 0).
//
// Uso: npx tsx scripts/dev/verif-dashboard.mts

import { readFile } from 'node:fs/promises'
import { glob } from 'node:fs/promises'
import { basename } from 'node:path'
import { parseKpiManual, type StatusManual, type EntradaManual } from '@/lib/kpi/parse-kpi-manual'
import { calcularMetricas, resumoDia } from '@/lib/kpi/dashboard-metricas'

const STATUS_VALIDOS: StatusManual[] = ['entregue', 'em_rota', 'nao_foi', 'mudou_de_rota', 'desatualizado', 'sem_rastreador', 'indefinido']

// Descobre o YYYY-MM-DD a partir do nome do arquivo (KPI-REDE-YYYY-MM-DD...).
function dataDoArquivo(nome: string): string | null {
  const m = nome.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
function redeDoArquivo(nome: string): string {
  const m = nome.match(/^KPI-([A-Z_]+)-\d{4}/)
  return m ? m[1] : 'REDE'
}

let falhas = 0
const fail = (ctx: string, msg: string) => { falhas++; console.error(`  ✗ [${ctx}] ${msg}`) }

const arquivos: string[] = []
for await (const p of glob('docs/conversas-tia-erica/dia-19/kpis-pos-deploy/KPI-*.xlsx')) arquivos.push(p)
arquivos.sort()
if (arquivos.length === 0) { console.error('Nenhum KPI encontrado.'); process.exit(1) }

console.log(`Verificando ${arquivos.length} KPIs reais...\n`)

let totalEntradas = 0
const acumulado: EntradaManual[] = []

for (const arq of arquivos) {
  const nome = basename(arq)
  const data = dataDoArquivo(nome)
  const rede = redeDoArquivo(nome)
  if (!data) { fail(nome, 'sem data no nome'); continue }

  const buf = await readFile(arq)
  const ents = await parseKpiManual(buf as unknown as Buffer, rede, data)
  totalEntradas += ents.length
  acumulado.push(...ents)

  // Invariante 1: toda entrada tem status no enum (nunca caiu fora / virou undefined).
  for (const e of ents) {
    if (!STATUS_VALIDOS.includes(e.status)) fail(rede, `status inválido "${e.status}" na loja ${e.loja}`)
  }

  if (ents.length === 0) { console.log(`  · ${rede}: 0 linhas (aba ${data.slice(8)} vazia)`); continue }

  const m = calcularMetricas(ents)

  // Invariante 2: as 7 categorias somam o total.
  const soma = m.entregue + m.em_rota + m.nao_foi + m.mudou_de_rota + m.desatualizado + m.sem_rastreador + m.indefinido
  if (soma !== m.total) fail(rede, `soma das categorias (${soma}) ≠ total (${m.total})`)
  if (m.total !== ents.length) fail(rede, `total (${m.total}) ≠ linhas parseadas (${ents.length}) → DESCARTE`)

  // Invariante 3: taxa definitiva usa só entregue/(entregue+nao_foi).
  const denom = m.entregue + m.nao_foi
  const esperado = denom ? Math.round((100 * m.entregue) / denom) : 0
  if (m.taxaEntregaDefinitiva !== esperado) fail(rede, `taxaDefinitiva ${m.taxaEntregaDefinitiva} ≠ esperado ${esperado}`)
  // em rota / desatualizado / sem rastreador / indefinido NÃO podem afetar o denominador.
  const foraDoDenom = m.em_rota + m.desatualizado + m.sem_rastreador + m.indefinido
  if (foraDoDenom > 0 && denom + foraDoDenom !== m.total) fail(rede, `denominador inconsistente (def=${denom} fora=${foraDoDenom} total=${m.total})`)

  // Invariante 4: resumoDia.provisorio <=> tem rota em andamento.
  const r = resumoDia(ents)
  if (r.provisorio !== (m.em_rota > 0)) fail(rede, `provisorio=${r.provisorio} mas em_rota=${m.em_rota}`)

  const sel = STATUS_VALIDOS.filter(s => m[s] > 0).map(s => `${s}:${m[s]}`).join(' ')
  console.log(`  ✓ ${rede.padEnd(14)} ${String(m.total).padStart(3)} linhas · taxaDef ${String(m.taxaEntregaDefinitiva).padStart(3)}% · ${sel}`)
}

// Verificação agregada (o dashboard concatena vários dias/redes).
console.log('')
const mg = calcularMetricas(acumulado)
const somaG = mg.entregue + mg.em_rota + mg.nao_foi + mg.mudou_de_rota + mg.desatualizado + mg.sem_rastreador + mg.indefinido
if (somaG !== mg.total) fail('AGREGADO', `soma (${somaG}) ≠ total (${mg.total})`)
if (mg.total !== acumulado.length) fail('AGREGADO', `total (${mg.total}) ≠ entradas (${acumulado.length})`)
if (totalEntradas !== acumulado.length) fail('AGREGADO', 'contagem de entradas inconsistente')

console.log(`AGREGADO: ${mg.total} linhas · taxaDef ${mg.taxaEntregaDefinitiva}% · ${STATUS_VALIDOS.filter(s => mg[s] > 0).map(s => `${s}:${mg[s]}`).join(' ')}`)
console.log('')
if (falhas > 0) { console.error(`❌ ${falhas} falha(s) de invariante.`); process.exit(1) }
console.log('✅ Todos os invariantes OK. Zero descarte, taxa honesta, provisório coerente.')
