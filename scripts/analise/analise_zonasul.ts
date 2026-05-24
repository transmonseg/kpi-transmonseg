/**
 * Análise ZONA_SUL para qualquer data (auto-descobre arquivos).
 *
 * Uso: npx tsx scripts/analise/analise_zonasul.ts 2026-05-18
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'
config({ path: '.env.local' })
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const ESCALA_BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const DOWNLOADS = 'C:/Users/media/Downloads'

function findFiles(data: string): { escalaPath: string; unitracPath: string; kpiPath: string } {
  const dia = data.slice(-2)
  const folder = join(ESCALA_BASE, `ESCALA DIA ${dia}`)
  const files = readdirSync(folder)
  const escalaName = files.find(f => f.toUpperCase().startsWith('ESCALA ZONA SUL') && f.endsWith('.xlsx'))
  const unitracName = files.find(f => f.toLowerCase().startsWith('relatorio_') && f.endsWith('.xlsx'))
  if (!escalaName) throw new Error(`Escala ZONA SUL não encontrada em ${folder}`)
  if (!unitracName) throw new Error(`Unitrac não encontrado em ${folder}`)
  const kpiName = `KPI-ZONA_SUL-${data}.xlsx`
  return {
    escalaPath: join(folder, escalaName),
    unitracPath: join(folder, unitracName),
    kpiPath: join(DOWNLOADS, kpiName),
  }
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

async function main() {
  const data = process.argv[2]
  if (!data || !/^2026-05-\d{2}$/.test(data)) {
    console.error('Uso: npx tsx scripts/analise/analise_zonasul.ts 2026-05-DD')
    process.exit(2)
  }

  const { escalaPath, unitracPath, kpiPath } = findFiles(data)
  process.stdout.write(`Carregando escala ZONA_SUL ${data}...\n`)
  const escalaRaw = await parseEscalaZonaSul(readFileSync(escalaPath), data)
  const escala = escalaRaw.map(toEscalaRow)
  process.stdout.write(`  ${escala.length} linhas\n`)

  process.stdout.write('Carregando Unitrac...\n')
  const veiculos = await parseUnitrac(readFileSync(unitracPath))
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

  let kpiM: Map<string, KpiLinha>
  try {
    kpiM = await lerKpi(kpiPath)
  } catch (e) {
    process.stdout.write(`AVISO: KPI manual não disponível em ${kpiPath} (${(e as Error).message})\n`)
    kpiM = new Map()
  }

  const lojaMap = new Map<string, EscalaLinhaRow[]>()
  for (const l of escala) {
    const arr = lojaMap.get(l.loja_nome_raw) ?? []
    arr.push(l)
    lojaMap.set(l.loja_nome_raw, arr)
  }

  process.stdout.write(`=== ANÁLISE ZONA_SUL — ${data} ===\nSC=SaídaCD  CHD=ChegadaLoja  SL=SaídaLoja\n\n`)

  function noData(v: string): boolean { return v === '---' || v.startsWith('SEM') || v.startsWith('NAO') }
  function arrEq(a: string[], b: string[]): boolean {
    return a.every((v, i) => (noData(v) && noData(b[i])) || v === b[i])
  }

  let nOk = 0, nDiff = 0

  for (const [loja, slots] of lojaMap) {
    const km = kpiM.get(loja)

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

      const mArr = slot === 1
        ? [km?.sc1 ?? '---', km?.chd1 ?? '---', km?.sl1 ?? '---']
        : [km?.sc2 ?? '---', km?.chd2 ?? '---', km?.sl2 ?? '---']

      const matchDiff = kpiM.size > 0 && !arrEq(matchArr, mArr)
      if (matchDiff) nDiff++; else nOk++

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
      if (kpiM.size > 0) process.stdout.write(`       MANUAL : ${mArr.join(' / ')}\n`)
    }
  }

  process.stdout.write('\n══════════════════════════════════════════\n')
  if (kpiM.size > 0) {
    process.stdout.write(`RESUMO MATCHER×MANUAL: OK=${nOk}  DIFF=${nDiff}  ← código atual\n`)
  } else {
    process.stdout.write(`RESUMO: ${escala.length} linhas analisadas (sem KPI manual para comparar)\n`)
  }
  process.stdout.write('══════════════════════════════════════════\n')
}

main().catch(e => { console.error('ERRO:', e.stack); process.exit(1) })
