// Sweep ZS todos dias: compara manual vs sistema gerado localmente para cada dia
// Detecta padrões de bug e produz relatório
import { readFileSync, readdirSync, existsSync } from 'fs'
import * as XLSX from 'xlsx'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'

const MAN = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI ZONA SUL-MANUAL.xlsx'
const BASE_ROOT = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

function fmtCell(v: any): string {
  if (v == null || v === '') return ''
  if (v instanceof Date) {
    const ms = v.getTime() + 2*3600*1000 + 34*60*1000
    const d = new Date(ms)
    return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`
  }
  const s = String(v).trim()
  if (s.startsWith('SEM') || s.startsWith('NÃO') || s.startsWith('FOI ')) return s
  const m = s.match(/(\d{1,2}):(\d{2})/)
  if (m) return `${m[1].padStart(2,'0')}:${m[2]}`
  return s
}
function fmt(d: any): string {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}
function normLoja(s: string): string {
  return s.toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '')
}

interface Resumo { dia: string; total: number; ok: number; parcial: number; errado: number; soMan: number; soGer: number; bugs: string[] }

;(async () => {
  const wb = XLSX.read(readFileSync(MAN), { type: 'buffer', cellDates: true })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojas } = await sb
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  const resumos: Resumo[] = []

  for (const aba of wb.SheetNames) {
    if (!/^\d{2}$/.test(aba)) continue
    const dia = aba
    const pasta = `${BASE_ROOT}/ESCALA DIA ${dia}`
    if (!existsSync(pasta)) continue

    // Manual
    const ws = wb.Sheets[aba]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
    const manual: Record<string, { sc: string; chd: string; sl: string; placa: string }> = {}
    for (const r of rows) {
      if (!r || r.length < 6) continue
      const loja = String(r[0] ?? '').trim()
      if (!loja || /REDES|RELAT|MOTORISTA/i.test(loja)) continue
      manual[normLoja(loja)] = {
        placa: String(r[2] ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase(),
        sc: fmtCell(r[3]),
        chd: fmtCell(r[4]),
        sl: fmtCell(r[5]),
      }
    }

    // Gera localmente
    const files = readdirSync(pasta)
    const escZs = files.find(f => /ZONA.*SUL/i.test(f) && f.endsWith('.xlsx'))
    const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
    if (!escZs || !xlsxFile) continue
    const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
    let zsLinhas: any[] = []
    try {
      const escala = await parseEscalaZonaSul(readFileSync(pasta + '/' + escZs), `2026-05-${dia}`)
      zsLinhas = escala.filter(l => l.rede_id === 'ZONA_SUL')
    } catch (e) { console.log(`d${dia} escala erro: ${(e as Error).message}`); continue }
    if (zsLinhas.length === 0) continue
    const xlsx = await parseUnitrac(readFileSync(pasta + '/' + xlsxFile))
    const pdf = pdfFile ? await parseUnitracPdf(readFileSync(pasta + '/' + pdfFile), new Set()).catch(() => []) : []
    const veiculos = new Map<string, any>()
    for (const v of xlsx) veiculos.set(v.placa_norm, v)
    for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)
    const todas = Array.from(veiculos.values()).flatMap(v => v.paradas)

    const escRow = zsLinhas.map((l, i) => ({
      id: 'e'+i, rede_id: l.rede_id, placa_norm: l.placa_norm,
      loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw,
      motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem,
      data_entrega: l.data_entrega, sub_rede: l.sub_rede ?? null,
    }))
    const pRow = todas.map((p, i) => ({
      id: 'p'+i, placa_norm: p.placa_norm,
      chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada),
      saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null),
      duracao_seg: p.duracao_seg ?? null,
      local_parada: p.local_parada ?? '',
      codigo_loja: p.codigo_loja ?? null, nome_loja: p.nome_loja ?? null,
      lat: p.lat ?? null, lng: p.lng ?? null,
      classificacao: p.classificacao, ordem: p.ordem,
    }))
    const rotas = await cruzaEscalaUnitrac(escRow, pRow, lojas ?? [])
    const gerado: Record<string, { sc: string; chd: string; sl: string; placa: string }> = {}
    for (const r of rotas) {
      const e = escRow.find(x => x.id === r.escala_linha_id)!
      gerado[normLoja(e.loja_nome_raw)] = {
        placa: e.placa_norm ?? '',
        sc: fmt(r.saida_cd),
        chd: r.paradas[0] ? fmt(r.paradas[0].chegada) : '',
        sl: r.paradas[0] ? fmt(r.paradas[0].saida) : '',
      }
    }

    // Compara
    let ok = 0, parcial = 0, errado = 0, soMan = 0, soGer = 0
    const bugs: string[] = []
    const toMin = (t: string) => { const x = t?.match(/(\d+):(\d+)/); return x ? parseInt(x[1])*60+parseInt(x[2]) : null }
    for (const [k, m] of Object.entries(manual)) {
      const g = gerado[k]
      if (!g) { soMan++; continue }
      const naoFoi = !m.chd || /N[aã]o|FOI /i.test(m.chd) || /SEM/i.test(m.sc)
      const sysSem = !g.chd
      if (naoFoi) {
        if (sysSem) ok++
        else { errado++; bugs.push(`${k}:CONFLITO_GPS_vs_MAN_NaoFoi`) }
        continue
      }
      const chdMatch = g.chd === m.chd
      const slMatch = g.sl === m.sl
      if (chdMatch && slMatch) ok++
      else if (sysSem) { errado++; bugs.push(`${k}:SEM_MATCH(man=${m.chd}/${m.sl})`) }
      else {
        const dChd = toMin(g.chd) !== null && toMin(m.chd) !== null ? Math.abs(toMin(g.chd)! - toMin(m.chd)!) : null
        const dSl = toMin(g.sl) !== null && toMin(m.sl) !== null ? Math.abs(toMin(g.sl)! - toMin(m.sl)!) : null
        if (dChd !== null && dSl !== null && dChd <= 5 && dSl <= 10) parcial++
        else { errado++; bugs.push(`${k}:DELTA(sys=${g.chd}/${g.sl} man=${m.chd}/${m.sl})`) }
      }
    }
    for (const k of Object.keys(gerado)) if (!manual[k]) soGer++
    const total = Object.keys(manual).length
    resumos.push({ dia, total, ok, parcial, errado, soMan, soGer, bugs })
  }

  console.log('═══ SWEEP ZS TODOS DIAS ═══\n')
  console.log('dia | total | ✅ | ⚠️ | ❌ | sóM | sóG | qualitativo')
  console.log('----+-------+----+----+----+-----+-----+-----------')
  for (const r of resumos) {
    const qual = ((r.ok + r.parcial) / r.total * 100).toFixed(0)
    console.log(` ${r.dia} |  ${String(r.total).padStart(2)}   | ${String(r.ok).padStart(2)} | ${String(r.parcial).padStart(2)} | ${String(r.errado).padStart(2)} |  ${String(r.soMan).padStart(2)} |  ${String(r.soGer).padStart(2)} | ${qual}%`)
  }
  console.log()

  // Bugs mais comuns
  const bugCount = new Map<string, number>()
  for (const r of resumos) {
    for (const b of r.bugs) {
      const tipo = b.split(':')[1]?.split('(')[0] ?? 'unknown'
      bugCount.set(tipo, (bugCount.get(tipo) ?? 0) + 1)
    }
  }
  console.log('═══ Padrões de bug ═══')
  for (const [tipo, count] of [...bugCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(3)}x  ${tipo}`)
  }
})()
