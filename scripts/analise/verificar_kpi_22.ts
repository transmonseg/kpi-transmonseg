/**
 * Verifica uma KPI específica do dia 22 contra:
 *   - Escala da rede (xlsx/pdf)
 *   - Alterações (PDF tabular do dia 22)
 *   - Unitrac (relatorio_9588.xlsx — GPS real)
 *   - KPI gerado (xlsx em ~/Downloads)
 *
 * Mostra rota por rota o que está no KPI gerado vs. o que o GPS mostra,
 * destacando discrepâncias (SC=CHD impossível, sem GPS encontrado, etc).
 *
 * Uso: npx tsx scripts/analise/verificar_kpi_22.ts <REDE_ID> [arquivo_kpi.xlsx]
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
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22'
const DOWNLOADS = 'C:/Users/media/Downloads'
const DATA = '2026-05-22'

const REDE_ID = process.argv[2]?.toUpperCase()
const KPI_FILE_OVERRIDE = process.argv[3]
if (!REDE_ID) {
  console.error('Uso: npx tsx scripts/analise/verificar_kpi_22.ts <REDE_ID> [arquivo]')
  process.exit(1)
}

function toHHMM(iso: string | Date | null | undefined): string {
  if (!iso) return '---'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

function fmtKpiCell(v: unknown): string {
  if (!v) return '---'
  if (typeof v === 'object' && v !== null && 'result' in v) return fmtKpiCell((v as { result: unknown }).result)
  if (v instanceof Date) return toHHMM(v)
  if (typeof v === 'number') {
    const s = Math.round(v * 86400)
    return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  }
  if (typeof v === 'string') {
    if (v.toUpperCase().includes('SEM')) return 'SEM'
    if (v.toUpperCase().includes('NAO') || v.includes('NÃO')) return 'NAO_FOI'
    const trim = v.trim()
    if (/^\d{1,2}:\d{2}/.test(trim)) return trim
  }
  return '---'
}

function cvCell(cell: ExcelJS.Cell): string {
  const v = cell?.value
  if (v == null) return ''
  if (typeof v === 'object' && v !== null && 'richText' in v) {
    return (v as { richText: { text: string }[] }).richText.map(r => r.text).join('').trim()
  }
  if (typeof v === 'object' && v !== null && 'text' in v) return String((v as { text: string }).text).trim()
  return String(v).trim()
}

interface KpiLinha {
  motorista1: string; placa1: string; sc1: string; chd1: string; sl1: string
  motorista2: string; placa2: string; sc2: string; chd2: string; sl2: string
}

async function lerKpiGerado(path: string): Promise<Map<string, KpiLinha>> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  const map = new Map<string, KpiLinha>()
  for (let r = 5; r <= 300; r++) {
    const row = ws.getRow(r)
    const loja = cvCell(row.getCell(1))
    if (!loja) continue
    map.set(loja, {
      motorista1: cvCell(row.getCell(2)),
      placa1: cvCell(row.getCell(4)),
      sc1: fmtKpiCell(row.getCell(5).value),
      chd1: fmtKpiCell(row.getCell(6).value),
      sl1: fmtKpiCell(row.getCell(7).value),
      motorista2: cvCell(row.getCell(8)),
      placa2: cvCell(row.getCell(10)),
      sc2: fmtKpiCell(row.getCell(11).value),
      chd2: fmtKpiCell(row.getCell(12).value),
      sl2: fmtKpiCell(row.getCell(13).value),
    })
  }
  return map
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
  return parseEscalaGeral(readFileSync(BASE + '/ESCALA GERAL DE MAIO 0.xlsx'), DATA)
}

function localizarKpi(redeId: string): string | null {
  if (KPI_FILE_OVERRIDE) return KPI_FILE_OVERRIDE
  // Padrão: KPI-<REDE>-2026-05-22 (X).xlsx — pega o maior (X) (mais recente)
  const fs = require('fs') as typeof import('fs')
  const files = fs.readdirSync(DOWNLOADS).filter((f: string) =>
    f.startsWith(`KPI-${redeId}-2026-05-22`) && f.endsWith('.xlsx')
  )
  if (files.length === 0) return null
  files.sort()
  return DOWNLOADS + '/' + files[files.length - 1]
}

const OUT_DIR = 'docs/verificacao-22'
mkdirSync(OUT_DIR, { recursive: true })
const outBuffer: string[] = []
const origWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = ((chunk: string) => { outBuffer.push(chunk); origWrite(chunk); return true }) as typeof process.stdout.write

async function main() {
  process.stdout.write(`\n=== VERIFICAÇÃO ${REDE_ID} — ${DATA} ===\n\n`)

  // 1. Escala
  const escalaAll = await carregarEscala(REDE_ID)
  const escalaFiltrada = escalaAll.filter(l => l.rede_id === REDE_ID)
  process.stdout.write(`Escala: ${escalaFiltrada.length} linha(s) (filtrada de ${escalaAll.length})\n`)
  if (escalaFiltrada.length === 0) {
    process.stdout.write(`  AVISO: nenhuma linha pra rede=${REDE_ID}.\n`)
    return
  }

  // 2. Alterações
  let alteracoesRede: { loja: string; motorista: string; placa: string; ordem: number }[] = []
  try {
    const buf = readFileSync(BASE + '/alteracoes/ALTERACAO DE ESCALA GERAL 22.05.pdf')
    const alts = await parseAlteracaoPdfTabular(buf)
    alteracoesRede = alts
      .filter(a => a.rede_id === REDE_ID && a.entra)
      .map(a => ({
        loja: a.loja_nome_raw ?? '?',
        motorista: a.entra?.motorista_nome ?? '?',
        placa: a.entra?.placa_raw ?? '?',
        ordem: a.motivo?.startsWith('2') ? 2 : 1,
      }))
    process.stdout.write(`Alterações para ${REDE_ID}: ${alteracoesRede.length}\n`)
    for (const a of alteracoesRede) {
      process.stdout.write(`  ${a.ordem}º carro | ${a.loja} | ${a.motorista} | ${a.placa}\n`)
    }
  } catch (e: any) {
    process.stdout.write(`  (sem alterações ou erro lendo PDF: ${e.message})\n`)
  }
  process.stdout.write('\n')

  // 3. Unitrac (GPS real)
  process.stdout.write(`Carregando Unitrac...\n`)
  const veiculos = await parseUnitrac(readFileSync(BASE + '/relatorio_9588.xlsx'))
  const paradasRaw: ParadaUnitrac[] = veiculos.flatMap(v => v.paradas)
  const paradas = paradasRaw.map(toParadaRow)
  process.stdout.write(`  ${veiculos.length} veículos / ${paradas.length} paradas\n`)

  // 4. Lojas DB
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojasRaw, error: lojasErr } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)
  if (lojasErr) throw new Error(`lojas: ${lojasErr.message}`)
  const lojas: LojaRow[] = (lojasRaw ?? []) as LojaRow[]

  // 5. Matcher (gera o que SERIA o KPI a partir desses inputs)
  const escala = escalaFiltrada.map(toEscalaRow)
  const rotas = await cruzaEscalaUnitrac(escala, paradas, lojas)
  const rotaById = new Map(rotas.map(r => [r.escala_linha_id, r]))
  const gpsByPlaca = new Map<string, UnitracParadaRow[]>()
  for (const p of paradas) {
    if (!p.placa_norm) continue
    const arr = gpsByPlaca.get(p.placa_norm) ?? []
    arr.push(p)
    gpsByPlaca.set(p.placa_norm, arr)
  }
  process.stdout.write(`\n`)

  // 6. KPI gerado
  const kpiPath = localizarKpi(REDE_ID)
  let kpi: Map<string, KpiLinha> = new Map()
  if (kpiPath) {
    process.stdout.write(`KPI gerado: ${kpiPath.split('/').pop()}\n`)
    kpi = await lerKpiGerado(kpiPath)
    process.stdout.write(`  ${kpi.size} loja(s) no Excel\n\n`)
  } else {
    process.stdout.write(`KPI gerado: NÃO ENCONTRADO para ${REDE_ID}\n\n`)
  }

  // 7. Análise loja por loja
  process.stdout.write(`=== ANÁLISE POR LOJA ===\n`)
  const lojaMap = new Map<string, EscalaLinhaRow[]>()
  for (const l of escala) {
    const arr = lojaMap.get(l.loja_nome_raw) ?? []
    arr.push(l)
    lojaMap.set(l.loja_nome_raw, arr)
  }

  let totalOk = 0, totalIssue = 0
  for (const [loja, slots] of lojaMap) {
    process.stdout.write(`\n--- ${loja} ---\n`)
    const k = kpi.get(loja)
    if (!k) process.stdout.write(`  ⚠ Não encontrado no KPI gerado\n`)

    for (const l of slots) {
      const rota = rotaById.get(l.id)
      const ps = gpsByPlaca.get(l.placa_norm ?? '') ?? []
      const pBase = ps.filter(p => p.classificacao === 'BASE')
      const pLoja = ps.filter(p => p.classificacao === 'LOJA')
      const pFora = ps.filter(p => p.classificacao === 'FORA_BASE')

      const motorEscala = l.motorista_nome ?? '?'
      const placa = l.placa_norm ?? '?'
      const ordem = l.carro_ordem
      const matched = rota?.paradas[0]

      process.stdout.write(`  ${ordem}º carro: ${motorEscala} | ${placa}\n`)
      if (k) {
        const kSc = ordem === 1 ? k.sc1 : k.sc2
        const kChd = ordem === 1 ? k.chd1 : k.chd2
        const kSl = ordem === 1 ? k.sl1 : k.sl2
        const kPlaca = ordem === 1 ? k.placa1 : k.placa2
        const kMot = ordem === 1 ? k.motorista1 : k.motorista2
        process.stdout.write(`     KPI GER:  SC=${kSc} CHD=${kChd} SL=${kSl} (mot=${kMot} placa=${kPlaca})\n`)
      }
      if (!l.placa_norm) {
        process.stdout.write(`     [sem placa na escala — SEM RASTREADOR]\n`)
        continue
      }
      if (ps.length === 0) {
        process.stdout.write(`     [GPS NÃO ENCONTRADO pra placa ${placa}]\n`)
        totalIssue++
        continue
      }
      process.stdout.write(`     GPS: ${ps.length}p (${pBase.length}B ${pLoja.length}L ${pFora.length}F)\n`)
      // Detalhe das paradas para auditoria visual
      for (const p of pBase.slice(-3)) {
        process.stdout.write(`        BASE  ${toHHMM(p.chegada)} → ${toHHMM(p.saida)}\n`)
      }
      for (const p of pLoja) {
        process.stdout.write(`        LOJA  ${toHHMM(p.chegada)}-${toHHMM(p.saida)}  cod:${p.codigo_loja ?? '-'}  ${(p.nome_loja ?? p.local_parada ?? '').slice(0, 55)}\n`)
      }
      // Se nenhuma LOJA mas tem FORA_BASE, mostra (pode ter sido match geográfico)
      if (pLoja.length === 0 && pFora.length > 0) {
        for (const p of pFora.slice(0, 6)) {
          process.stdout.write(`        FORA  ${toHHMM(p.chegada)}-${toHHMM(p.saida)}  ${(p.local_parada ?? '').slice(0, 55)}\n`)
        }
      }
      // Match geográfico: indica se rota foi resolvida por geo (lat/lng)
      if (rota?._matchMeta) {
        process.stdout.write(`        meta: ${rota._matchMeta.algorithm}(${rota._matchMeta.score})\n`)
      }
      if (matched) {
        const sc = rota?.saida_cd ? toHHMM(rota.saida_cd) : '---'
        const chd = toHHMM(matched.chegada)
        const sl = toHHMM(matched.saida)
        process.stdout.write(`     MATCHER:  SC=${sc} CHD=${chd} SL=${sl}\n`)
        if (k) {
          const kSc = ordem === 1 ? k.sc1 : k.sc2
          const kChd = ordem === 1 ? k.chd1 : k.chd2
          const kSl = ordem === 1 ? k.sl1 : k.sl2
          const kPlaca = ordem === 1 ? k.placa1 : k.placa2
          const eqSc = sc === kSc
          const eqChd = chd === kChd
          const eqSl = sl === kSl
          const tag = eqSc && eqChd && eqSl ? '✓' : '⚠'
          process.stdout.write(`     KPI GER:  SC=${kSc} CHD=${kChd} SL=${kSl} (placa=${kPlaca}) ${tag}\n`)
          if (eqSc && eqChd && eqSl) totalOk++
          else totalIssue++
        }
      } else {
        process.stdout.write(`     MATCHER:  sem match\n`)
        totalIssue++
      }
    }
  }

  process.stdout.write(`\n=== RESUMO ===\n`)
  process.stdout.write(`  ✓ Matcher === KPI gerado: ${totalOk}\n`)
  process.stdout.write(`  ⚠ Issues (sem GPS, sem match ou divergência): ${totalIssue}\n`)

  // Salva relatório em arquivo
  const outPath = `${OUT_DIR}/${REDE_ID}.txt`
  writeFileSync(outPath, outBuffer.join(''), 'utf8')
  origWrite(`\n[Relatório salvo em ${outPath}]\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
