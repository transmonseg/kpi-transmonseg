/**
 * Análise placa a placa — ZONA SUL 20/05/2026
 * Usa os parsers reais + lojas do DB (para T17 rede-aware funcionar corretamente).
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20'
const DATA = '2026-05-20'

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
  for (let r = 5; r <= 70; r++) {
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

// Converte LinhaEscala → EscalaLinhaRow (injeta id fake)
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

// Converte ParadaUnitrac → UnitracParadaRow (injeta id fake)
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

async function main() {
  process.stdout.write('Carregando escala Zona Sul...\n')
  const escalaRaw = await parseEscalaZonaSul(readFileSync(BASE + '/ESCALA ZONA SUL - MAIO (7).xlsx'), DATA)
  const escala = escalaRaw.map(toEscalaRow)
  process.stdout.write(`  ${escala.length} linhas (data_entrega ${DATA})\n`)

  process.stdout.write('Carregando Unitrac...\n')
  const veiculos = await parseUnitrac(readFileSync(BASE + '/relatorio_9573.xlsx'))
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

  // Indexar rotas por escala_linha_id
  const rotaById = new Map(rotas.map(r => [r.escala_linha_id, r]))

  // Indexar paradas brutas por placa
  const gpsByPlaca = new Map<string, UnitracParadaRow[]>()
  for (const p of paradas) {
    const arr = gpsByPlaca.get(p.placa_norm) ?? []
    arr.push(p)
    gpsByPlaca.set(p.placa_norm, arr)
  }

  // KPIs
  const [kpiM, kpiG] = await Promise.all([
    lerKpi('C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-20.xlsx'),
    lerKpi('C:/Users/media/Downloads/KPI ZONA_SUL.xlsx'),
  ])

  // Agrupar escala por loja
  const lojaMap = new Map<string, EscalaLinhaRow[]>()
  for (const l of escala) {
    const arr = lojaMap.get(l.loja_nome_raw) ?? []
    arr.push(l)
    lojaMap.set(l.loja_nome_raw, arr)
  }

  process.stdout.write('=== ANÁLISE PLACA A PLACA — ZONA SUL 20/05/2026 ===\n')
  process.stdout.write('SC=SaídaCD  CHD=ChegadaLoja  SL=SaídaLoja\n\n')

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

      // O que o matcher resolveu para esta rota
      const matchSc  = rota?.saida_cd ? toHHMM(rota.saida_cd) : '---'
      const matchChd = rota?.paradas[0] ? toHHMM(rota.paradas[0].chegada) : '---'
      const matchSl  = rota?.paradas[0] ? toHHMM(rota.paradas[0].saida)   : '---'
      const matchArr = [matchSc, matchChd, matchSl]

      const mArr = slot === 1
        ? [km?.sc1 ?? '---', km?.chd1 ?? '---', km?.sl1 ?? '---']
        : [km?.sc2 ?? '---', km?.chd2 ?? '---', km?.sl2 ?? '---']
      const gArr = slot === 1
        ? [kg?.sc1 ?? '---', kg?.chd1 ?? '---', kg?.sl1 ?? '---']
        : [kg?.sc2 ?? '---', kg?.chd2 ?? '---', kg?.sl2 ?? '---']

      const diff = mArr.join('/') !== gArr.join('/')
      if (diff) nDiff++; else nOk++

      const matchDiff = matchArr.join('/') !== mArr.join('/')
      if (matchDiff) nMatchDiff++; else nMatchOk++

      const tag = matchDiff ? '[DIFF]' : '[OK]  '
      const algo = rota?._matchMeta?.algorithm ?? 'none'
      const score = rota?._matchMeta?.score ?? '?'
      const gpsTag = !l.placa_norm ? 'GPS:NAO-PLACA'
        : ps.length === 0 ? 'GPS:NAO'
        : `GPS:SIM [${ps.length}p | ${pBase.length}B ${pLoja.length}L ${pFora.length}F]`

      process.stdout.write(`\n${tag} [c${slot}] ${loja}\n`)
      process.stdout.write(`       ${l.motorista_nome ?? '?'} | ${l.placa_norm ?? '?'} | ${gpsTag} | match=${algo}(${score})\n`)

      // BASE saídas
      for (const p of pBase.filter(x => x.saida).slice(-2)) {
        const dur = Math.round((p.duracao_seg ?? 0) / 60)
        process.stdout.write(`       BASE  chg:${toHHMM(p.chegada)} → sai:${toHHMM(p.saida)}  ${dur}min\n`)
      }

      // Todas as paradas LOJA do veículo
      for (const p of pLoja) {
        const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
        const matched = rota?.paradas.some(rp => rp.parada_id === p.id) ? ' ◄MATCHED' : ''
        process.stdout.write(`       LOJA  ${toHHMM(p.chegada)}-${toHHMM(p.saida)}  ${dur}  cod:${p.codigo_loja ?? '?'}  ${(p.nome_loja ?? p.local_parada ?? '').slice(0, 50)}${matched}\n`)
      }

      // Sem LOJA
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
