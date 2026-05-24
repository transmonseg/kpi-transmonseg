/**
 * Verificação COMPLETA de uma KPI específica do dia 22 com 7 checks profundos.
 *
 * Fontes:
 *   - Escala da rede (xlsx/pdf)
 *   - Alterações (PDF tabular)
 *   - Unitrac (GPS real)
 *   - KPI gerado (xlsx em ~/Downloads)
 *   - Cadastro de lojas (Supabase) — pra lat/lng/raio
 *
 * Os 7 checks (ver docs/verificacao-22/CHECKLIST.md):
 *   1. Motorista (escala vs KPI)
 *   2. Contagem global (escala N vs KPI N)
 *   3. Alterações aplicadas
 *   4. Todas as colunas do KPI Excel
 *   5. Lat/lng das paradas (distância vs raio)
 *   6. Ambos slots da linha (placa1 + placa2)
 *   7. Anomalias (placeholder — Supabase)
 *
 * Saída: docs/verificacao-22/<REDE>.md (markdown estruturado).
 *
 * Uso: npx tsx scripts/analise/verificar_kpi_22_completo.ts <REDE_ID> [arquivo_kpi.xlsx]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaGuanabaraPdf } from '@/lib/parsers/escala-guanabara-pdf'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'
import type { AlteracaoParsed } from '@/lib/parsers/alteracao-text'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22'
const DOWNLOADS = 'C:/Users/media/Downloads'
const DATA = '2026-05-22'
const OUT_DIR = 'docs/verificacao-22'

const REDE_ID = process.argv[2]?.toUpperCase()
const KPI_FILE_OVERRIDE = process.argv[3]
if (!REDE_ID) {
  console.error('Uso: npx tsx scripts/analise/verificar_kpi_22_completo.ts <REDE_ID> [arquivo]')
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
const md: string[] = []
const append = (s: string) => md.push(s)

// =========================
// UTILS
// =========================

function toHHMM(iso: string | Date | null | undefined): string {
  if (!iso) return '---'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

function fmtKpiCell(v: unknown): string {
  if (v == null) return '---'
  if (typeof v === 'object' && 'result' in v) return fmtKpiCell((v as { result: unknown }).result)
  if (v instanceof Date) return toHHMM(v)
  if (typeof v === 'number') {
    const s = Math.round(v * 86400)
    return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  }
  if (typeof v === 'string') {
    if (v.toUpperCase().includes('SEM')) return 'SEM'
    if (v.includes('NÃO') || v.toUpperCase().includes('NAO')) return 'NAO_FOI'
    const trim = v.trim()
    if (/^\d{1,2}:\d{2}/.test(trim)) return trim
  }
  return '---'
}

function cvCell(cell: ExcelJS.Cell): string {
  const v = cell?.value
  if (v == null) return ''
  if (typeof v === 'object' && v !== null) {
    if ('richText' in v)
      return (v as { richText: { text: string }[] }).richText.map(r => r.text).join('').trim()
    if ('text' in v) return String((v as { text: string }).text).trim()
    if ('result' in v) {
      const r = (v as { result: unknown }).result
      if (r instanceof Date) return toHHMM(r)
      if (typeof r === 'number') {
        // Provável serial de tempo Excel (fração do dia)
        if (r < 1 && r > 0) {
          const s = Math.round(r * 86400)
          return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0')
        }
        return String(r)
      }
      return r == null ? '' : String(r).trim()
    }
    if (v instanceof Date) return toHHMM(v)
  }
  return String(v).trim()
}

function normalizaNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// =========================
// LEITURA KPI EXCEL — COMPLETA (todas colunas)
// =========================

interface KpiSlotData { motorista: string; codigo: string; placa: string; sc: string; chd: string; sl: string }
interface KpiLinhaData {
  loja: string
  rowIdx: number
  slot1: KpiSlotData
  slot2: KpiSlotData
  obs: string
  extras: Record<string, string>  // colunas 14+
}

async function lerKpiCompleto(path: string): Promise<{ headers: string[]; linhas: KpiLinhaData[] }> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  const headers: string[] = []
  for (let c = 1; c <= 30; c++) {
    const h = cvCell(ws.getRow(4).getCell(c)) || cvCell(ws.getRow(3).getCell(c)) || cvCell(ws.getRow(2).getCell(c))
    headers.push(h)
  }
  const linhas: KpiLinhaData[] = []
  for (let r = 5; r <= 400; r++) {
    const row = ws.getRow(r)
    const loja = cvCell(row.getCell(1))
    if (!loja) continue
    const extras: Record<string, string> = {}
    for (let c = 14; c <= 25; c++) {
      const v = cvCell(row.getCell(c))
      if (v && headers[c - 1]) extras[headers[c - 1] || `col${c}`] = v
    }
    linhas.push({
      loja,
      rowIdx: r,
      slot1: {
        motorista: cvCell(row.getCell(2)),
        codigo: cvCell(row.getCell(3)),
        placa: cvCell(row.getCell(4)),
        sc: fmtKpiCell(row.getCell(5).value),
        chd: fmtKpiCell(row.getCell(6).value),
        sl: fmtKpiCell(row.getCell(7).value),
      },
      slot2: {
        motorista: cvCell(row.getCell(8)),
        codigo: cvCell(row.getCell(9)),
        placa: cvCell(row.getCell(10)),
        sc: fmtKpiCell(row.getCell(11).value),
        chd: fmtKpiCell(row.getCell(12).value),
        sl: fmtKpiCell(row.getCell(13).value),
      },
      obs: '',
      extras,
    })
  }
  return { headers, linhas }
}

// =========================
// CONVERSORES
// =========================

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

async function carregarEscala(redeId: string): Promise<LinhaEscala[]> {
  const pax = ['SUPER_PAX', 'FEIRA_NOVA', 'EMANUEL']
  if (pax.includes(redeId)) {
    return parseEscalaPax(readFileSync(BASE + '/ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx'), DATA)
  }
  if (redeId === 'ARMAZEM_GRAO') {
    return parseEscalaArmazemGrao(readFileSync(BASE + '/ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx'), DATA)
  }
  if (redeId === 'ZONA_SUL') {
    return parseEscalaZonaSul(readFileSync(BASE + '/ESCALA ZONA SUL - MAIO (8).xlsx'), DATA)
  }
  if (redeId === 'GUANABARA') {
    return parseEscalaGuanabaraPdf(readFileSync(BASE + '/ESCALA 23.05.pdf'), DATA)
  }
  return parseEscalaGeral(readFileSync(BASE + '/ESCALA GERAL DE MAIO 0.xlsx'), DATA)
}

function localizarKpi(redeId: string): string | null {
  if (KPI_FILE_OVERRIDE) return KPI_FILE_OVERRIDE
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs')
  const files = fs.readdirSync(DOWNLOADS).filter((f: string) =>
    f.startsWith(`KPI-${redeId}-2026-05-22`) && f.endsWith('.xlsx')
  )
  if (files.length === 0) return null
  files.sort()
  return DOWNLOADS + '/' + files[files.length - 1]
}

// =========================
// MAIN
// =========================

async function main() {
  append(`# Análise ${REDE_ID} — Dia 22/05/2026`)
  append('')
  append(`> Análise completa com 7 checks (ver \`CHECKLIST.md\`)`)
  append('')

  // --- Carregamentos
  const escalaAll = await carregarEscala(REDE_ID)
  const escalaFiltrada = escalaAll.filter(l => l.rede_id === REDE_ID)
  const escala = escalaFiltrada.map(toEscalaRow)

  let alteracoes: AlteracaoParsed[] = []
  try {
    const buf = readFileSync(BASE + '/alteracoes/ALTERACAO DE ESCALA GERAL 22.05.pdf')
    const todas = await parseAlteracaoPdfTabular(buf)
    alteracoes = todas.filter(a => a.rede_id === REDE_ID)
  } catch (e) { /* sem PDF de alteração */ void e }

  const veiculos = await parseUnitrac(readFileSync(BASE + '/relatorio_9588.xlsx'))
  const paradasRaw: ParadaUnitrac[] = veiculos.flatMap(v => v.paradas)
  const paradas = paradasRaw.map(toParadaRow)

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
  const lojasMap = new Map(lojas.map(l => [l.id, l]))

  const rotas = await cruzaEscalaUnitrac(escala, paradas, lojas)
  const rotaById = new Map(rotas.map(r => [r.escala_linha_id, r]))
  const gpsByPlaca = new Map<string, UnitracParadaRow[]>()
  for (const p of paradas) {
    if (!p.placa_norm) continue
    const arr = gpsByPlaca.get(p.placa_norm) ?? []
    arr.push(p)
    gpsByPlaca.set(p.placa_norm, arr)
  }

  const kpiPath = localizarKpi(REDE_ID)
  let kpiHeaders: string[] = []
  let kpiLinhas: KpiLinhaData[] = []
  if (kpiPath) {
    const r = await lerKpiCompleto(kpiPath)
    kpiHeaders = r.headers
    kpiLinhas = r.linhas
  }
  const kpiByLoja = new Map(kpiLinhas.map(k => [k.loja, k]))

  // --- Sumário
  append('## Sumário')
  append('')
  append(`- **Data:** ${DATA}`)
  append(`- **Rede:** ${REDE_ID}`)
  append(`- **Escala:** ${escalaFiltrada.length} linha(s)`)
  append(`- **Alterações:** ${alteracoes.length}`)
  append(`- **Unitrac:** ${veiculos.length} veículos, ${paradas.length} paradas`)
  append(`- **KPI gerado:** ${kpiPath?.split('/').pop() ?? 'NÃO ENCONTRADO'} (${kpiLinhas.length} linhas)`)
  append('')

  const problemas: string[] = []

  // ====================
  // CHECK 1 — MOTORISTA
  // ====================
  append('## Check 1 — Motorista (escala vs KPI)')
  append('')
  const motoristaIssues: string[] = []
  for (const l of escala) {
    const k = kpiByLoja.get(l.loja_nome_raw)
    if (!k) continue
    const slot = l.carro_ordem === 1 ? k.slot1 : k.slot2
    const nomeEscala = normalizaNome(l.motorista_nome ?? '')
    const nomeKpi = normalizaNome(slot.motorista ?? '')
    if (!nomeEscala || !nomeKpi) continue
    // Aceita: contains parcial (ex: "JOSE ROBERTO" vs "JOSÉ ROBERTO BARBOSA")
    if (nomeEscala !== nomeKpi && !nomeEscala.includes(nomeKpi) && !nomeKpi.includes(nomeEscala)) {
      motoristaIssues.push(`- **${l.loja_nome_raw}** (c${l.carro_ordem}): escala="${l.motorista_nome}" KPI="${slot.motorista}"`)
    }
  }
  if (motoristaIssues.length === 0) append('✓ Todos motoristas batem com a escala.')
  else {
    append(`⚠ **${motoristaIssues.length} divergência(s):**`)
    motoristaIssues.forEach(s => append(s))
    problemas.push(`Check 1 (Motorista): ${motoristaIssues.length} divergências`)
  }
  append('')

  // =============================
  // CHECK 2 — CONTAGEM GLOBAL
  // =============================
  append('## Check 2 — Contagem global (escala vs KPI)')
  append('')
  const lojasEscala = new Set(escalaFiltrada.map(l => l.loja_nome_raw))
  const lojasKpi = new Set(kpiLinhas.map(k => k.loja))
  const lojasFaltantes = [...lojasEscala].filter(l => !lojasKpi.has(l))
  const lojasExtras = [...lojasKpi].filter(l => !lojasEscala.has(l))
  append(`- Escala: ${lojasEscala.size} lojas distintas`)
  append(`- KPI: ${lojasKpi.size} lojas`)
  if (lojasFaltantes.length === 0 && lojasExtras.length === 0) {
    append('✓ Contagens batem exatamente.')
  } else {
    if (lojasFaltantes.length > 0) {
      append(`⚠ **${lojasFaltantes.length} loja(s) na escala mas FALTANDO no KPI:**`)
      lojasFaltantes.forEach(l => append(`  - ${l}`))
      problemas.push(`Check 2: ${lojasFaltantes.length} lojas faltando no KPI`)
    }
    if (lojasExtras.length > 0) {
      append(`⚠ **${lojasExtras.length} loja(s) no KPI mas SEM escala:**`)
      lojasExtras.forEach(l => append(`  - ${l}`))
      problemas.push(`Check 2: ${lojasExtras.length} lojas extras no KPI`)
    }
  }
  append('')

  // ================================
  // CHECK 3 — ALTERAÇÕES APLICADAS
  // ================================
  append('## Check 3 — Alterações aplicadas')
  append('')
  if (alteracoes.length === 0) append('Sem alterações para esta rede.')
  else {
    append(`Alterações encontradas no PDF: ${alteracoes.length}`)
    append('')
    const altIssues: string[] = []
    for (const a of alteracoes) {
      const lojaNome = a.loja_nome_raw ?? '?'
      const novaPlaca = a.entra?.placa_raw ?? '?'
      const novoMot = a.entra?.motorista_nome ?? '?'
      append(`- **${lojaNome}** → carro ${a.motivo}: motorista=${novoMot} placa=${novaPlaca}`)
      // Busca correspondência fuzzy no KPI
      const kpiLoja = kpiLinhas.find(k => normalizaNome(k.loja).includes(normalizaNome(lojaNome.split('-')[0] ?? '')))
      if (!kpiLoja) {
        altIssues.push(`Alteração de "${lojaNome}" — loja não encontrada no KPI`)
        append(`  ⚠ Loja não encontrada no KPI`)
        continue
      }
      const ordem = a.motivo?.startsWith('2') ? 2 : 1
      const slot = ordem === 1 ? kpiLoja.slot1 : kpiLoja.slot2
      const placaOk = slot.placa.replace(/[-\s]/g, '').toUpperCase() === novaPlaca.replace(/[-\s]/g, '').toUpperCase()
      const motOk = normalizaNome(slot.motorista).includes(normalizaNome(novoMot.replace(/^(KIA|710 C\/ RAMPA)\s*/i, '').trim()))
      if (placaOk && motOk) append(`  ✓ KPI reflete a alteração (placa ${slot.placa}, motorista ${slot.motorista})`)
      else {
        altIssues.push(`Alteração "${lojaNome}" não aplicada: KPI tem placa=${slot.placa} mot=${slot.motorista}`)
        append(`  ⚠ KPI tem placa=${slot.placa} mot=${slot.motorista} — divergente`)
      }
    }
    if (altIssues.length > 0) problemas.push(`Check 3: ${altIssues.length} alteração(ões) não aplicada(s)`)
  }
  append('')

  // =====================================
  // CHECK 4 — COLUNAS EXTRAS DO KPI EXCEL
  // =====================================
  append('## Check 4 — Colunas extras do KPI Excel')
  append('')
  append(`Cabeçalhos detectados: ${kpiHeaders.filter(Boolean).map((h, i) => `[${i + 1}] ${h}`).join(' | ')}`)
  append('')
  const linhasComExtras = kpiLinhas.filter(k => Object.keys(k.extras).length > 0)
  if (linhasComExtras.length === 0) append('Nenhuma coluna extra preenchida.')
  else {
    append(`${linhasComExtras.length} loja(s) com dados em colunas extras:`)
    for (const k of linhasComExtras.slice(0, 10)) {
      const extras = Object.entries(k.extras).map(([n, v]) => `${n}=${v}`).join(', ')
      append(`  - **${k.loja}**: ${extras}`)
    }
    if (linhasComExtras.length > 10) append(`  ... e mais ${linhasComExtras.length - 10}`)
  }
  append('')

  // =============================
  // CHECK 5 — LAT/LNG DAS PARADAS
  // =============================
  append('## Check 5 — Lat/lng das paradas (vs cadastro)')
  append('')
  const distIssues: string[] = []
  for (const l of escala) {
    const rota = rotaById.get(l.id)
    if (!rota || !rota.paradas[0] || !rota.loja_id) continue
    const loja = lojasMap.get(rota.loja_id)
    if (!loja?.lat || !loja?.lng) continue
    const p = rota.paradas[0]
    if (p.lat == null || p.lng == null) continue
    const dist = haversineMetros(p.lat, p.lng, loja.lat, loja.lng)
    const raio = loja.raio_metros ?? 200
    if (dist > raio * 1.5) {
      distIssues.push(`  - **${l.loja_nome_raw}**: parada a ${Math.round(dist)}m do centro (raio cadastrado=${raio}m)`)
    }
  }
  if (distIssues.length === 0) append('✓ Todas paradas dentro do raio cadastrado (com margem 1.5x).')
  else {
    append(`⚠ **${distIssues.length} parada(s) fora do raio (1.5x):**`)
    distIssues.forEach(s => append(s))
    problemas.push(`Check 5: ${distIssues.length} paradas fora do raio`)
  }
  append('')

  // ============================================
  // CHECK 6 — AMBOS SLOTS DA LINHA (placa1+placa2)
  // ============================================
  append('## Check 6 — Ambos slots da linha do KPI')
  append('')
  const slotIssues: string[] = []
  const escalaPorLoja = new Map<string, EscalaLinhaRow[]>()
  for (const l of escala) {
    const arr = escalaPorLoja.get(l.loja_nome_raw) ?? []
    arr.push(l); escalaPorLoja.set(l.loja_nome_raw, arr)
  }
  for (const k of kpiLinhas) {
    const slotsEscala = escalaPorLoja.get(k.loja) ?? []
    const temSlot1Data = k.slot1.placa || (k.slot1.chd && k.slot1.chd !== '---' && k.slot1.chd !== 'SEM')
    const temSlot2Data = k.slot2.placa || (k.slot2.chd && k.slot2.chd !== '---' && k.slot2.chd !== 'SEM')
    const slot1NaEscala = slotsEscala.some(l => l.carro_ordem === 1)
    const slot2NaEscala = slotsEscala.some(l => l.carro_ordem === 2)
    if (temSlot2Data && !slot2NaEscala) {
      slotIssues.push(`**${k.loja}**: KPI tem 2º carro (placa ${k.slot2.placa}) mas escala só tem 1 carro`)
    }
    if (!temSlot1Data && slot1NaEscala && !temSlot2Data) {
      // OK — pode ser linha SEM/sem GPS
    }
    if (temSlot1Data && !slot1NaEscala) {
      slotIssues.push(`**${k.loja}**: KPI tem 1º carro mas escala não tem`)
    }
  }
  if (slotIssues.length === 0) append('✓ Slots batem com escala.')
  else {
    append(`⚠ **${slotIssues.length} divergência(s):**`)
    slotIssues.forEach(s => append(`- ${s}`))
    problemas.push(`Check 6: ${slotIssues.length} slots divergentes`)
  }
  append('')

  // ====================================
  // CHECK 7 — ANOMALIAS (PLACEHOLDER)
  // ====================================
  append('## Check 7 — Anomalias do sistema')
  append('')
  append('_Pendente: requer acesso à tabela `kpis` no Supabase com `qtd_anomalias_high/medium/low`._')
  append('')

  // =====================
  // DETALHE LOJA POR LOJA
  // =====================
  append('## Detalhe — Loja por loja')
  append('')
  for (const [loja, slots] of escalaPorLoja) {
    const k = kpiByLoja.get(loja)
    append(`### ${loja}`)
    if (!k) {
      append('⚠ Não encontrada no KPI gerado')
      append('')
      continue
    }
    for (const l of slots) {
      const rota = rotaById.get(l.id)
      const ps = gpsByPlaca.get(l.placa_norm ?? '') ?? []
      const pLoja = ps.filter(p => p.classificacao === 'LOJA')
      const slotK = l.carro_ordem === 1 ? k.slot1 : k.slot2
      append(`- **c${l.carro_ordem}**: ${l.motorista_nome ?? '?'} | ${l.placa_norm ?? '?'}`)
      append(`  - Escala: motorista=${l.motorista_nome ?? '?'} placa=${l.placa_norm ?? '?'}`)
      append(`  - KPI: motorista=${slotK.motorista} placa=${slotK.placa} | SC=${slotK.sc} CHD=${slotK.chd} SL=${slotK.sl}`)
      const matched = rota?.paradas[0]
      if (matched) {
        append(`  - Matcher: SC=${rota?.saida_cd ? toHHMM(rota.saida_cd) : '---'} CHD=${toHHMM(matched.chegada)} SL=${toHHMM(matched.saida)}`)
      } else if (!l.placa_norm) {
        append(`  - Sem placa (SEM rastreador)`)
      } else if (ps.length === 0) {
        append(`  - GPS: placa não encontrada no Unitrac`)
      } else {
        append(`  - GPS: ${ps.length}p mas matcher sem match`)
      }
      if (pLoja.length > 0) {
        append(`  - GPS LOJA: ${pLoja.map(p => `${toHHMM(p.chegada)}-${toHHMM(p.saida)} [${p.codigo_loja ?? '-'}] ${(p.nome_loja ?? '').slice(0, 30)}`).join(' | ')}`)
      }
    }
    append('')
  }

  // =====
  // RESUMO FINAL
  // =====
  append('## Problemas identificados')
  append('')
  if (problemas.length === 0) append('✓ Nenhum problema detectado.')
  else problemas.forEach(p => append(`- ${p}`))
  append('')

  const outPath = `${OUT_DIR}/${REDE_ID}.md`
  writeFileSync(outPath, md.join('\n'), 'utf8')
  process.stdout.write(`\n[Relatório salvo em ${outPath}]\n`)
  process.stdout.write(`Problemas: ${problemas.length}\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
