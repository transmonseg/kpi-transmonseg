// Fase 2: pra cada loja faltante (02, 16, 23, 24, 37, 39, 41, 1129),
// buscar manual em todos dias 02-21 e cruzar com GPS pra inferir coord real
import { readFileSync, readdirSync, existsSync } from 'fs'
import * as XLSX from 'xlsx'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const MAN = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI ZONA SUL-MANUAL.xlsx'
const PASTAS_BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

const LOJAS_BUSCA = ['02', '16', '23', '24', '37', '39', '41', '1129']

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}
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
function timeToMin(t: string): number | null {
  const m = t?.match(/^(\d{1,2}):(\d{2})/)
  return m ? parseInt(m[1])*60 + parseInt(m[2]) : null
}

;(async () => {
  const wb = XLSX.read(readFileSync(MAN), { type: 'buffer', cellDates: true })
  // Pra cada loja, busca em cada aba dia
  const cands: Map<string, { dia: string; placa: string; mot: string; chd: string; sl: string }[]> = new Map()

  for (const aba of wb.SheetNames) {
    if (!/^\d{2}$/.test(aba)) continue
    const ws = wb.Sheets[aba]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
    for (const r of rows) {
      if (!r || r.length < 6) continue
      const lojaTxt = String(r[0] ?? '').trim()
      if (!lojaTxt || /REDES|RELAT|MOTORISTA/i.test(lojaTxt)) continue
      // Extrai número da loja
      const numMatch = lojaTxt.match(/Loja\s*(\d+)/i) ?? lojaTxt.match(/(\d+)/)
      const num = numMatch?.[1] ?? null
      if (!num || !LOJAS_BUSCA.includes(num)) continue
      const placa = String(r[2] ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
      const mot = String(r[1] ?? '').trim()
      const chd = fmtCell(r[4])
      const sl = fmtCell(r[5])
      if (!placa || /N[aã]o/i.test(chd) || /SEM/i.test(chd)) continue
      const arr = cands.get(num) ?? []
      arr.push({ dia: aba, placa, mot, chd, sl })
      cands.set(num, arr)
    }
  }

  // Pra cada candidata, busca GPS da placa no dia
  for (const num of LOJAS_BUSCA) {
    const arr = cands.get(num) ?? []
    console.log(`\n═══ LOJA ${num} (${arr.length} candidatos) ═══`)
    if (arr.length === 0) { console.log('  Nenhuma entrega manual encontrada nos dias 02-21'); continue }
    const coords: { lat: number; lng: number; dia: string; placa: string; deltaMin: number }[] = []
    for (const c of arr) {
      const pasta = `${PASTAS_BASE}/ESCALA DIA ${c.dia}`
      if (!existsSync(pasta)) continue
      const files = readdirSync(pasta)
      const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
      if (!xlsxFile) continue
      const xlsx = await parseUnitrac(readFileSync(pasta + '/' + xlsxFile))
      const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
      const pdf = pdfFile ? await parseUnitracPdf(readFileSync(pasta + '/' + pdfFile), new Set()).catch(() => []) : []
      const veiculos = new Map<string, any>()
      for (const v of xlsx) veiculos.set(v.placa_norm, v)
      for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)
      const v = veiculos.get(c.placa)
      if (!v) continue
      // Acha parada com horário mais próximo do CHD manual
      const chdMin = timeToMin(c.chd)
      if (chdMin === null) continue
      let melhor: any = null
      let melhorDelta = 30 // limite 30min
      for (const p of v.paradas) {
        const h = new Date(p.chegada).getUTCHours() * 60 + new Date(p.chegada).getUTCMinutes()
        const delta = Math.abs(h - chdMin)
        if (delta < melhorDelta && p.lat != null && p.lng != null) {
          melhorDelta = delta
          melhor = p
        }
      }
      if (melhor) {
        coords.push({ lat: melhor.lat, lng: melhor.lng, dia: c.dia, placa: c.placa, deltaMin: melhorDelta })
        console.log(`  d${c.dia} ${c.placa.padEnd(10)} ${c.mot.slice(0,15).padEnd(15)} chd=${c.chd} → GPS ${fmt(melhor.chegada)} (Δ${melhorDelta}min) ${melhor.lat.toFixed(5)},${melhor.lng.toFixed(5)} [${melhor.classificacao}]`)
      } else {
        console.log(`  d${c.dia} ${c.placa.padEnd(10)} ${c.mot.slice(0,15).padEnd(15)} chd=${c.chd} → GPS sem parada próxima`)
      }
    }
    // Agrupa coords próximas (≤300m) e mostra centróide
    if (coords.length >= 2) {
      const lats = coords.map(c => c.lat).sort((a, b) => a - b)
      const lngs = coords.map(c => c.lng).sort((a, b) => a - b)
      const medLat = lats[Math.floor(lats.length/2)]
      const medLng = lngs[Math.floor(lngs.length/2)]
      console.log(`  ⇒ Coord candidata (mediana ${coords.length} dias): ${medLat.toFixed(5)}, ${medLng.toFixed(5)}`)
    }
  }
})()
