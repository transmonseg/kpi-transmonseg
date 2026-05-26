// Triangula coords reais ZS via GPS multi-dia + manual
// Pra cada loja, busca manual em todos dias com placa+horário
// Acha parada GPS da placa que bate horário manual → coord candidata
// Coord consistente em ≥2 dias = canônica
import { readFileSync, readdirSync, existsSync } from 'fs'
import * as XLSX from 'xlsx'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

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
  const m = s.match(/(\d{1,2}):(\d{2})/)
  if (m) return `${m[1].padStart(2,'0')}:${m[2]}`
  return s
}
function timeToMin(t: string): number | null {
  const m = t?.match(/^(\d{1,2}):(\d{2})/)
  return m ? parseInt(m[1])*60 + parseInt(m[2]) : null
}
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3, toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2
  return 2 * R * Math.asin(Math.sqrt(a))
}

;(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojas } = await sb
    .from('lojas')
    .select('id, nome, codigo_escala, codigo_unitrac, lat, lng, raio_metros')
    .eq('rede_id', 'ZONA_SUL').eq('ativo', true).order('nome')

  // Lê manual todos dias, coleta horários por loja
  const wb = XLSX.read(readFileSync(MAN), { type: 'buffer', cellDates: true })
  const porLoja = new Map<string, { dia: string; placa: string; chd: string; sl: string }[]>()
  for (const aba of wb.SheetNames) {
    if (!/^\d{2}$/.test(aba)) continue
    const ws = wb.Sheets[aba]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]
    for (const r of rows) {
      if (!r || r.length < 6) continue
      const lojaTxt = String(r[0] ?? '').trim()
      if (!lojaTxt || /REDES|RELAT|MOTORISTA/i.test(lojaTxt)) continue
      const numMatch = lojaTxt.match(/Loja\s*(\d+)/i) ?? lojaTxt.match(/(\d{2,})/)
      const num = numMatch?.[1]
      if (!num) continue
      const placa = String(r[2] ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
      const chd = fmtCell(r[4])
      const sl = fmtCell(r[5])
      if (!placa || !chd || /N[aã]o|SEM|FOI/i.test(chd)) continue
      const arr = porLoja.get(num) ?? []
      arr.push({ dia: aba, placa, chd, sl })
      porLoja.set(num, arr)
    }
  }

  // Carrega GPS de cada dia
  const cacheVeic = new Map<string, Map<string, any>>()
  async function getVeic(dia: string): Promise<Map<string, any>> {
    if (cacheVeic.has(dia)) return cacheVeic.get(dia)!
    const pasta = `${BASE_ROOT}/ESCALA DIA ${dia}`
    const veic = new Map<string, any>()
    if (existsSync(pasta)) {
      const files = readdirSync(pasta)
      const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
      const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
      if (xlsxFile) {
        const xlsx = await parseUnitrac(readFileSync(pasta + '/' + xlsxFile))
        for (const v of xlsx) veic.set(v.placa_norm, v)
      }
      if (pdfFile) {
        const pdf = await parseUnitracPdf(readFileSync(pasta + '/' + pdfFile), new Set()).catch(() => [])
        for (const v of pdf) if (!veic.has(v.placa_norm)) veic.set(v.placa_norm, v)
      }
    }
    cacheVeic.set(dia, veic)
    return veic
  }

  // Pra cada loja: para cada (dia, placa, chd), buscar parada GPS perto do horário
  console.log('Loja | dias com manual | coord triangulada vs cadastro')
  console.log('-----+-----------------+-------------------------------')
  const propostas: { numLoja: string; nomeCad: string; latNova: number; lngNova: number; nDias: number; driftM: number }[] = []
  for (const [num, candidatos] of porLoja) {
    if (candidatos.length < 2) continue
    const cad = lojas?.find(l => {
      const m = l.nome.match(/(\d+)/)
      return m && m[1].replace(/^0+/,'') === num.replace(/^0+/,'')
    })
    const coords: { lat: number; lng: number; dia: string }[] = []
    for (const c of candidatos) {
      const veic = await getVeic(c.dia)
      const v = veic.get(c.placa)
      if (!v) continue
      const chdMin = timeToMin(c.chd)
      if (chdMin === null) continue
      let melhor: any = null, melhorDelta = 15
      for (const p of v.paradas) {
        if (p.lat == null || p.lng == null) continue
        const h = new Date(p.chegada).getUTCHours() * 60 + new Date(p.chegada).getUTCMinutes()
        const delta = Math.abs(h - chdMin)
        if (delta < melhorDelta) { melhorDelta = delta; melhor = p }
      }
      if (melhor) coords.push({ lat: melhor.lat, lng: melhor.lng, dia: c.dia })
    }
    if (coords.length < 2) continue
    // Mediana
    const lats = coords.map(c => c.lat).sort((a, b) => a - b)
    const lngs = coords.map(c => c.lng).sort((a, b) => a - b)
    const medLat = lats[Math.floor(lats.length/2)]
    const medLng = lngs[Math.floor(lngs.length/2)]
    // Verifica consistência: paradas a ≤300m da mediana
    const consistentes = coords.filter(c => haversine(c.lat, c.lng, medLat, medLng) <= 300)
    if (consistentes.length < 2) continue
    const drift = cad?.lat && cad?.lng ? haversine(cad.lat, cad.lng, medLat, medLng) : -1
    propostas.push({
      numLoja: num,
      nomeCad: cad?.nome ?? `??Loja ${num}`,
      latNova: medLat, lngNova: medLng,
      nDias: consistentes.length,
      driftM: Math.round(drift),
    })
    if (drift > 200 || drift < 0) {
      const driftTxt = drift >= 0 ? `drift=${drift < 1000 ? Math.round(drift)+'m' : (drift/1000).toFixed(1)+'km'}` : 'SEM_GEO'
      console.log(`  ${num.padStart(4)} | ${String(consistentes.length).padStart(2)} dias ✓     | ${cad?.nome.slice(0,30) ?? '?'} ${driftTxt}`)
    }
  }
  console.log(`\nTotal propostas: ${propostas.length}`)
  console.log(`Propostas com drift > 500m: ${propostas.filter(p => p.driftM > 500).length}`)

  // Salva propostas
  const fs = await import('fs')
  fs.writeFileSync('docs/db-changes/zs_coords_triangular_propostas.json', JSON.stringify(propostas, null, 2))
  console.log('\nSalvo em docs/db-changes/zs_coords_triangular_propostas.json')
})()
