// Fase 3: debugar Loja 33 Humaitá dia 19 (sys=---, BBH1C94 tem 1 LOJA no GPS)
import { readFileSync, readdirSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE_19 = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(lat2-lat1); const dLon = toRad(lon2-lon1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2
  return 2 * R * Math.asin(Math.sqrt(a))
}

;(async () => {
  const files = readdirSync(BASE_19)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))!
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  const xlsx = await parseUnitrac(readFileSync(BASE_19 + '/' + xlsxFile))
  const pdf = pdfFile ? await parseUnitracPdf(readFileSync(BASE_19 + '/' + pdfFile), new Set()).catch(() => []) : []
  const veiculos = new Map<string, any>()
  for (const v of xlsx) veiculos.set(v.placa_norm, v)
  for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)

  // Cadastro Loja 33
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: loja33 } = await sb
    .from('lojas')
    .select('*')
    .eq('rede_id', 'ZONA_SUL')
    .ilike('nome', '%33%')
  console.log('Cadastro Loja 33:')
  for (const l of loja33 ?? []) console.log(`  ${l.nome}: lat=${l.lat} lng=${l.lng} raio=${l.raio_metros} cod-uni=${l.codigo_unitrac} cod-esc=${l.codigo_escala}`)

  // Manual: Loja 33 Humaitá GILSON JOSUE BBH1C94 SC 04:55 CHD 05:30 SL 07:50
  // Placa BBH1C94 dia 19
  const v = veiculos.get('BBH1C94')
  if (!v) { console.log('BBH1C94 ausente'); return }
  console.log(`\nBBH1C94 — ${v.paradas.length} paradas:`)
  for (const p of [...v.paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))) {
    const dur = p.duracao_seg ? Math.round(p.duracao_seg/60) + 'min' : '?'
    // Distância da Loja 33
    const cadL33 = loja33?.[0]
    let dInfo = ''
    if (cadL33?.lat && cadL33?.lng && p.lat != null && p.lng != null) {
      const d = haversine(cadL33.lat, cadL33.lng, p.lat, p.lng)
      dInfo = `dist33=${d < 1000 ? Math.round(d)+'m' : (d/1000).toFixed(1)+'km'}`
    }
    console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur.padStart(6)})  cod=${(p.codigo_loja ?? '-').padEnd(10)} lat=${p.lat ?? '?'} lng=${p.lng ?? '?'}  ${dInfo}`)
  }
})()
