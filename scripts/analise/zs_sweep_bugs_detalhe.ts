// Lista detalhe dos casos SEM_MATCH em todos dias ZS
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
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '')
}

;(async () => {
  const wb = XLSX.read(readFileSync(MAN), { type: 'buffer', cellDates: true })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojas } = await sb
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  const casos: { dia: string; loja: string; placa: string; mot: string; manSc: string; manChd: string; manSl: string; placaGpsEstadoEscala: string; placaGpsEstadoManual: string }[] = []

  for (const aba of wb.SheetNames) {
    if (!/^\d{2}$/.test(aba)) continue
    const dia = aba
    const pasta = `${BASE_ROOT}/ESCALA DIA ${dia}`
    if (!existsSync(pasta)) continue

    const ws = wb.Sheets[aba]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
    const manual: Record<string, { sc: string; chd: string; sl: string; placa: string; mot: string; lojaTxt: string }> = {}
    for (const r of rows) {
      if (!r || r.length < 6) continue
      const loja = String(r[0] ?? '').trim()
      if (!loja || /REDES|RELAT|MOTORISTA/i.test(loja)) continue
      manual[normLoja(loja)] = {
        lojaTxt: loja,
        mot: String(r[1] ?? '').trim(),
        placa: String(r[2] ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase(),
        sc: fmtCell(r[3]), chd: fmtCell(r[4]), sl: fmtCell(r[5]),
      }
    }

    const files = readdirSync(pasta)
    const escZs = files.find(f => /ZONA.*SUL/i.test(f) && f.endsWith('.xlsx'))
    const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
    if (!escZs || !xlsxFile) continue
    const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))

    let zsLinhas: any[] = []
    try {
      const escala = await parseEscalaZonaSul(readFileSync(pasta + '/' + escZs), `2026-05-${dia}`)
      zsLinhas = escala.filter(l => l.rede_id === 'ZONA_SUL')
    } catch (e) { continue }
    const xlsx = await parseUnitrac(readFileSync(pasta + '/' + xlsxFile))
    const pdf = pdfFile ? await parseUnitracPdf(readFileSync(pasta + '/' + pdfFile), new Set()).catch(() => []) : []
    const veiculos = new Map<string, any>()
    for (const v of xlsx) veiculos.set(v.placa_norm, v)
    for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)

    const escRow = zsLinhas.map((l, i) => ({
      id: 'e'+i, rede_id: l.rede_id, placa_norm: l.placa_norm,
      loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw,
      motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem,
      data_entrega: l.data_entrega, sub_rede: l.sub_rede ?? null,
    }))
    const todas = Array.from(veiculos.values()).flatMap(v => v.paradas)
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
    const gerado: Record<string, { sc: string; chd: string; sl: string; placaEsc: string }> = {}
    for (const r of rotas) {
      const e = escRow.find(x => x.id === r.escala_linha_id)!
      gerado[normLoja(e.loja_nome_raw)] = {
        placaEsc: e.placa_norm ?? '',
        sc: fmt(r.saida_cd),
        chd: r.paradas[0] ? fmt(r.paradas[0].chegada) : '',
        sl: r.paradas[0] ? fmt(r.paradas[0].saida) : '',
      }
    }

    for (const [k, m] of Object.entries(manual)) {
      const g = gerado[k]
      if (!g) continue
      const naoFoi = !m.chd || /N[aã]o|FOI /i.test(m.chd) || /SEM/i.test(m.sc)
      const sysSem = !g.chd
      if (naoFoi || !sysSem) continue
      // Caso SEM_MATCH (sys=---, manual com horário)
      const placaGpsEsc = g.placaEsc && veiculos.has(g.placaEsc) ? 'ON' : 'OFF'
      const placaGpsMan = m.placa && veiculos.has(m.placa) ? 'ON' : 'OFF'
      casos.push({
        dia, loja: m.lojaTxt, placa: m.placa, mot: m.mot,
        manSc: m.sc, manChd: m.chd, manSl: m.sl,
        placaGpsEstadoEscala: `${g.placaEsc}=${placaGpsEsc}`,
        placaGpsEstadoManual: `${m.placa}=${placaGpsMan}`,
      })
    }
  }

  console.log(`═══ Total SEM_MATCH: ${casos.length} ═══\n`)
  // Agrupa por placa do manual
  const porPlaca = new Map<string, typeof casos>()
  for (const c of casos) {
    const arr = porPlaca.get(c.placa) ?? []
    arr.push(c)
    porPlaca.set(c.placa, arr)
  }
  console.log('Por placa manual:')
  for (const [placa, arr] of [...porPlaca.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (arr.length < 2) continue
    console.log(`\n  ${placa} (${arr.length}x):`)
    for (const c of arr.slice(0, 3)) {
      console.log(`    d${c.dia} ${c.loja.slice(0,30).padEnd(30)} man=${c.manSc}/${c.manChd}/${c.manSl}  | ${c.placaGpsEstadoManual} | escala=${c.placaGpsEstadoEscala}`)
    }
  }
  console.log('\nPlacas ÚNICAS (1x):')
  let solo = 0
  for (const [_, arr] of porPlaca) if (arr.length === 1) solo++
  console.log(`  ${solo} placas com 1 caso só`)
})()
