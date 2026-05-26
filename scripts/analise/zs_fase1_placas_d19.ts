// Fase 1.3 + 1.4: extrai placas que fizeram ZS dia 19 (manual + escala)
// e mapeia escala→manual: qual placa fez qual loja
import { readFileSync, readdirSync } from 'fs'
import * as XLSX from 'xlsx'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const MAN = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI ZONA SUL-MANUAL.xlsx'
const BASE_19 = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

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

;(async () => {
  // Manual ZS dia 19
  const wb = XLSX.read(readFileSync(MAN), { type: 'buffer', cellDates: true })
  const ws = wb.Sheets['19']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
  // Header cols: 0=loja, 1=motorista, 2=placa, 3=SC, 4=CHD, 5=SL
  console.log('═══ MANUAL ZS dia 19 ═══')
  const manualEntradas: { loja: string; mot: string; placa: string; sc: string; chd: string; sl: string }[] = []
  for (const r of rows) {
    if (!r || r.length < 6) continue
    const loja = String(r[0] ?? '').trim()
    if (!loja || /REDES|RELAT|MOTORISTA/i.test(loja)) continue
    const mot = String(r[1] ?? '').trim()
    const placa = String(r[2] ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
    const sc = fmtCell(r[3])
    const chd = fmtCell(r[4])
    const sl = fmtCell(r[5])
    manualEntradas.push({ loja, mot, placa, sc, chd, sl })
  }

  // Agrupa por placa
  const porPlaca = new Map<string, typeof manualEntradas>()
  for (const e of manualEntradas) {
    const k = e.placa || '?'
    const arr = porPlaca.get(k) ?? []
    arr.push(e)
    porPlaca.set(k, arr)
  }
  console.log(`Total lojas manual: ${manualEntradas.length}`)
  console.log(`Placas únicas: ${porPlaca.size}\n`)

  // Lista placas com info
  console.log('═══ Placas que fizeram ZS dia 19 (segundo manual) ═══')
  for (const [placa, entradas] of porPlaca) {
    const ents = entradas.map(e => `${e.loja.match(/Loja\s*(\w+)/)?.[1] ?? '?'}(${e.chd})`).join(', ')
    console.log(`  ${placa.padEnd(10)} ${entradas[0].mot.padEnd(20)}  ${ents.slice(0, 70)}`)
  }

  // GPS das placas dia 19
  const files = readdirSync(BASE_19)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))!
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  const xlsx = await parseUnitrac(readFileSync(BASE_19 + '/' + xlsxFile))
  const pdf = pdfFile ? await parseUnitracPdf(readFileSync(BASE_19 + '/' + pdfFile), new Set()).catch(() => []) : []
  const veiculos = new Map<string, any>()
  for (const v of xlsx) veiculos.set(v.placa_norm, v)
  for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)

  console.log('\n═══ GPS dia 19 das placas ZS ═══')
  for (const placa of porPlaca.keys()) {
    if (!placa || placa === '?') continue
    const v = veiculos.get(placa)
    if (!v) { console.log(`  ${placa}: AUSENTE no Unitrac`); continue }
    const lojas = v.paradas.filter((p: any) => p.classificacao === 'LOJA').length
    const fora = v.paradas.filter((p: any) => p.classificacao === 'FORA_BASE').length
    const base = v.paradas.filter((p: any) => p.classificacao === 'BASE').length
    console.log(`  ${placa}: ${v.paradas.length} paradas (${lojas} LOJA, ${fora} FORA, ${base} BASE)`)
  }
})()
