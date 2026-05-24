/**
 * Análise dia 18/05/2026 — redes da Escala Geral + PAX + Armazém
 * Uso: npx tsx scripts/analise/analise_18_geral.ts <REDE_ID>
 * Ex: npx tsx scripts/analise/analise_18_geral.ts SUPER_PAX
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 18'
const DATA = '2026-05-18'

const REDE_ID = process.argv[2]?.toUpperCase()
if (!REDE_ID) {
  console.error('Uso: npx tsx scripts/analise/analise_18_geral.ts <REDE_ID>')
  console.error('Redes disponíveis: SUPER_PAX FEIRA_NOVA MUNDIAL SENDAS CARREFOUR ATACADAO ASSAI PREZUNIC VIANENSE PRINCESA SUPERPRIX SAMS_CLUB ARMAZEM_GRAO')
  process.exit(1)
}

const KPI_GERADO: Record<string, string> = {
  SUPER_PAX:    'KPI-SUPER_PAX-2026-05-18.xlsx',
  FEIRA_NOVA:   'KPI-FEIRA_NOVA-2026-05-18.xlsx',
  MUNDIAL:      'KPI-MUNDIAL-2026-05-18.xlsx',
  SENDAS:       'KPI-SENDAS-2026-05-18.xlsx',
  CARREFOUR:    'KPI-CARREFOUR-2026-05-18.xlsx',
  ATACADAO:     'KPI-ATACADAO-2026-05-18.xlsx',
  ASSAI:        'KPI-ASSAI-2026-05-18.xlsx',
  PREZUNIC:     'KPI-PREZUNIC-2026-05-18 (2).xlsx',
  VIANENSE:     'KPI-VIANENSE-2026-05-18.xlsx',
  PRINCESA:     'KPI-PRINCESA-2026-05-18 (15).xlsx',
  SUPERPRIX:    'KPI-SUPERPRIX-2026-05-18.xlsx',
  SAMS_CLUB:    'KPI-SAMS_CLUB-2026-05-18.xlsx',
  ARMAZEM_GRAO: 'KPI-ARMAZEM_GRAO-2026-05-18.xlsx',
}

if (!KPI_GERADO[REDE_ID]) {
  console.error(`Rede desconhecida: ${REDE_ID}`)
  process.exit(1)
}

function toHHMM(iso: string | Date | null | undefined): string {
  if (!iso) return '---'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.getUTCHours() + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

function fmtKpiCell(v: unknown): string {
  if (!v) return '---'
  if (typeof v === 'object' && v !== null && 'result' in v) return fmtKpiCell((v as any).result)
  if (v instanceof Date) return toHHMM(v)
  if (typeof v === 'number') {
    const s = Math.round(v * 86400)
    return Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  }
  if (typeof v === 'string') {
    if (v.includes('SEM')) return 'SEM'
    if (v.includes('NÃO') || v.includes('NAO')) return 'NAO_FOI'
  }
  return '---'
}

function cvCell(cell: ExcelJS.Cell): string {
  const v = cell?.value
  if (!v && v !== 0) return ''
  if (typeof v === 'object' && v !== null && 'richText' in v) return (v as any).richText.map((r: any) => r.text).join('').trim()
  if (typeof v === 'object' && v !== null && 'text' in v) return String((v as any).text).trim()
  return String(v).trim()
}

interface KpiLinha {
  placa1: string; mot1: string; sc1: string; chd1: string; sl1: string
  placa2: string; mot2: string; sc2: string; chd2: string; sl2: string
}

async function lerKpi(path: string): Promise<Map<string, KpiLinha>> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  const map = new Map<string, KpiLinha>()
  for (let r = 5; r <= 200; r++) {
    const row = ws.getRow(r)
    const loja = cvCell(row.getCell(1))
    if (!loja) continue
    map.set(loja, {
      placa1: cvCell(row.getCell(4)), mot1: cvCell(row.getCell(2)),
      sc1: fmtKpiCell(row.getCell(5).value), chd1: fmtKpiCell(row.getCell(6).value), sl1: fmtKpiCell(row.getCell(7).value),
      placa2: cvCell(row.getCell(10)), mot2: cvCell(row.getCell(8)),
      sc2: fmtKpiCell(row.getCell(11).value), chd2: fmtKpiCell(row.getCell(12).value), sl2: fmtKpiCell(row.getCell(13).value),
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
    const buf = readFileSync(BASE + '/ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (5).xlsx')
    return parseEscalaPax(buf, DATA)
  }
  if (redeId === 'ARMAZEM_GRAO') {
    const buf = readFileSync(BASE + '/ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx')
    return parseEscalaArmazemGrao(buf, DATA)
  }
  const buf = readFileSync(BASE + '/ESCALA GERAL DE MAIO 1 (6).xlsx')
  return parseEscalaGeral(buf, DATA)
}

async function main() {
  process.stdout.write(`Carregando escala ${REDE_ID}...\n`)
  const escalaAll = await carregarEscala(REDE_ID)
  const escalaFiltrada = escalaAll.filter(l => l.rede_id === REDE_ID)
  const escala = escalaFiltrada.map(toEscalaRow)
  process.stdout.write(`  ${escala.length} linhas (filtrado de ${escalaAll.length} totais) data_entrega ${DATA}\n`)

  if (escala.length === 0) {
    process.stdout.write(`  AVISO: nenhuma linha para rede_id=${REDE_ID}. Redes encontradas: ${[...new Set(escalaAll.map(l => l.rede_id))].join(', ')}\n`)
    process.exit(0)
  }

  process.stdout.write('Carregando Unitrac...\n')
  const veiculos = await parseUnitrac(readFileSync(BASE + '/relatorio_9402.xlsx'))
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
  process.stdout.write(`  ${lojas.length} lojas\n`)

  process.stdout.write('Cruzando...\n')
  const rotas = await cruzaEscalaUnitrac(escala, paradas, lojas)
  process.stdout.write(`  ${rotas.length} rotas geradas\n\n`)

  const rotaById = new Map(rotas.map(r => [r.escala_linha_id, r]))
  const gpsByPlaca = new Map<string, UnitracParadaRow[]>()
  for (const p of paradas) {
    const arr = gpsByPlaca.get(p.placa_norm) ?? []
    arr.push(p)
    gpsByPlaca.set(p.placa_norm, arr)
  }

  const DL = 'C:/Users/media/Downloads/'
  const [kpiM, kpiG] = await Promise.all([
    lerKpi(DL + `KPI-${REDE_ID}-2026-05-18.xlsx`),
    lerKpi(DL + KPI_GERADO[REDE_ID]),
  ])

  const lojaMap = new Map<string, EscalaLinhaRow[]>()
  for (const l of escala) {
    const arr = lojaMap.get(l.loja_nome_raw) ?? []
    arr.push(l)
    lojaMap.set(l.loja_nome_raw, arr)
  }

  process.stdout.write(`=== ANÁLISE ${REDE_ID} — 18/05/2026 ===\n`)
  process.stdout.write('SC=SaídaCD  CHD=ChegadaLoja  SL=SaídaLoja\n\n')

  function noData(v: string): boolean { return v === '---' || v.startsWith('SEM') || v.startsWith('NAO') }
  function arrEq(a: string[], b: string[]): boolean {
    // PREZUNIC: manual=SEM significa "motorista sem rastreador no manual" (não ausência de entrega).
    // GPS correto prevalece sobre silêncio manual (ex: SPIDs com KANU/RAFAEL não têm coluna manual).
    if (REDE_ID === 'PREZUNIC' && b.every(v => v.startsWith('SEM'))) return true
    return a.every((v, i) => (noData(v) && noData(b[i])) || v === b[i])
  }
  function resolveSlot(placa: string | null, k: KpiLinha | undefined): 1 | 2 | 0 {
    if (!k || !placa) return 0
    const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, '')
    const p = norm(placa)
    if (k.placa1 && p === norm(k.placa1)) return 1
    if (k.placa2 && p === norm(k.placa2)) return 2
    return 0
  }

  let nOk = 0, nDiff = 0, nMatchOk = 0, nMatchDiff = 0

  for (const [loja, slots] of lojaMap) {
    const km = kpiM.get(loja)
    const kg = kpiG.get(loja)

    for (const l of slots) {
      const rota = rotaById.get(l.id)
      const slot = l.carro_ordem
      const ps = gpsByPlaca.get(l.placa_norm ?? '') ?? []
      const pBase = ps.filter(p => p.classificacao === 'BASE')
      const pLoja = ps.filter(p => p.classificacao === 'LOJA')
      const pFora = ps.filter(p => p.classificacao === 'FORA_BASE')

      const matchSc  = rota?.saida_cd ? toHHMM(rota.saida_cd) : '---'
      const matchChd = rota?.paradas[0] ? toHHMM(rota.paradas[0].chegada) : '---'
      const matchSl  = rota?.paradas[0] ? toHHMM(rota.paradas[0].saida)   : '---'
      const matchArr = [matchSc, matchChd, matchSl]

      const ks = resolveSlot(l.placa_norm, km) || (slot === 1 ? 1 : 2)
      const ksG = resolveSlot(l.placa_norm, kg) || (slot === 1 ? 1 : 2)
      const mArr = ks === 1
        ? [km?.sc1 ?? '---', km?.chd1 ?? '---', km?.sl1 ?? '---']
        : [km?.sc2 ?? '---', km?.chd2 ?? '---', km?.sl2 ?? '---']
      const gArr = ksG === 1
        ? [kg?.sc1 ?? '---', kg?.chd1 ?? '---', kg?.sl1 ?? '---']
        : [kg?.sc2 ?? '---', kg?.chd2 ?? '---', kg?.sl2 ?? '---']

      const diff = !arrEq(mArr, gArr)
      if (diff) nDiff++; else nOk++

      const matchDiff = !arrEq(matchArr, mArr)
      if (matchDiff) nMatchDiff++; else nMatchOk++

      const tag = matchDiff ? '[DIFF]' : '[OK]  '
      const algo = rota?._matchMeta?.algorithm ?? 'none'
      const score = rota?._matchMeta?.score ?? '?'
      const gpsTag = !l.placa_norm ? 'GPS:NAO-PLACA'
        : ps.length === 0 ? 'GPS:NAO'
        : `GPS:SIM [${ps.length}p | ${pBase.length}B ${pLoja.length}L ${pFora.length}F]`

      process.stdout.write(`\n${tag} [c${slot}] ${loja}\n`)
      process.stdout.write(`       ${l.motorista_nome ?? '?'} | ${l.placa_norm ?? '?'} | ${gpsTag} | match=${algo}(${score})\n`)

      for (const p of pBase.filter(x => x.saida).slice(-2)) {
        const dur = Math.round((p.duracao_seg ?? 0) / 60)
        process.stdout.write(`       BASE  chg:${toHHMM(p.chegada)} → sai:${toHHMM(p.saida)}  ${dur}min\n`)
      }

      for (const p of pLoja) {
        const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
        const matched = rota?.paradas.some(rp => rp.parada_id === p.id) ? ' ◄MATCHED' : ''
        process.stdout.write(`       LOJA  ${toHHMM(p.chegada)}-${toHHMM(p.saida)}  ${dur}  cod:${p.codigo_loja ?? '?'}  ${(p.nome_loja ?? p.local_parada ?? '').slice(0, 50)}${matched}\n`)
      }

      if (l.placa_norm && ps.length > 0 && pLoja.length === 0) {
        process.stdout.write(`       !! SEM LOJA — ${pFora.length}xFB ${pBase.length}xB\n`)
        for (const p of pFora.slice(0, 3)) {
          process.stdout.write(`       FB    ${toHHMM(p.chegada)}-${toHHMM(p.saida)}  ${(p.local_parada ?? '').slice(0, 50)}\n`)
        }
      }

      process.stdout.write(`       MATCHER: ${matchSc} / ${matchChd} / ${matchSl}\n`)
      process.stdout.write(`       MANUAL : ${mArr.join(' / ')}\n`)
      process.stdout.write(`       GERADO : ${gArr.join(' / ')}\n`)

      if (matchDiff) {
        const mH = parseInt(mArr[1]?.split(':')[0] ?? '99')
        const cH = parseInt(matchArr[1]?.split(':')[0] ?? '99')
        if (mArr[0] === 'SEM' && matchArr[0] !== '---' && matchArr[0] !== 'SEM')
          process.stdout.write(`       >> MANUAL=SEM_RASTREADOR mas matcher tem GPS — T18 falso positivo?\n`)
        else if (matchArr[0] === '---' && mArr[0] !== '---' && mArr[0] !== 'SEM')
          process.stdout.write(`       >> Matcher vazio, manual tem dado — GPS não encontrou esta loja\n`)
        else if (!isNaN(mH) && !isNaN(cH) && mH >= 10 && cH < 8 && cH >= 0)
          process.stdout.write(`       >> Matcher=madrugada(CHD ${matchArr[1]}), manual=tarde(CHD ${mArr[1]}) — 2 turnos\n`)
        else
          process.stdout.write(`       >> SC: ${matchArr[0]}≠${mArr[0]}  CHD: ${matchArr[1]}≠${mArr[1]}  SL: ${matchArr[2]}≠${mArr[2]}\n`)
      }
      if (diff && !matchDiff)
        process.stdout.write(`       !! MATCHER=OK mas GERADO≠MANUAL (Excel desatualizado?)\n`)
    }
  }

  process.stdout.write('\n══════════════════════════════════════════\n')
  process.stdout.write(`RESUMO GERADO×MANUAL:  OK=${nOk}  DIFF=${nDiff}\n`)
  process.stdout.write(`RESUMO MATCHER×MANUAL: OK=${nMatchOk}  DIFF=${nMatchDiff}  ← código atual\n`)
  process.stdout.write('══════════════════════════════════════════\n')
}

main().catch(e => { console.error('ERRO:', e.stack); process.exit(1) })
