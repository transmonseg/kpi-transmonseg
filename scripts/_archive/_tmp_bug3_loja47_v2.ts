/**
 * Bug 3 diagnostic V2 — explica POR QUE 19:40 (FORA_BASE) não vira match pra Loja 47 Catete.
 */
import { readFileSync, readdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { variantesOcr } from '@/lib/kpi/matcher'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const φ1 = toRad(lat1), φ2 = toRad(lat2)
  const Δφ = toRad(lat2 - lat1), Δλ = toRad(lng2 - lng1)
  const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function fmtT(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

;(async () => {
  const dia = '19'
  const PLACA_ALVO = 'LQE5401'
  const pasta = `${BASE}/ESCALA DIA ${dia}`

  // Buscar Loja 47 Catete no cadastro
  const { data: l47 } = await sb
    .from('lojas')
    .select('id, rede_id, nome, codigo_escala, codigo_unitrac, lat, lng, raio_metros')
    .eq('rede_id', 'ZONA_SUL')
    .or('codigo_escala.eq.47,codigo_unitrac.eq.47,nome.ilike.%Loja 47%')

  console.log(`--- CADASTRO LOJA 47 ---`)
  for (const l of l47 || []) console.log(`  ${JSON.stringify(l)}`)

  // Loja 30, 21
  const { data: lL30 } = await sb
    .from('lojas')
    .select('id, rede_id, nome, codigo_escala, codigo_unitrac, lat, lng, raio_metros')
    .eq('rede_id', 'ZONA_SUL')
    .or('codigo_escala.eq.30,codigo_unitrac.eq.30,codigo_escala.eq.21,codigo_unitrac.eq.21')

  console.log(`\n--- CADASTRO L30 e L21 ---`)
  for (const l of lL30 || []) console.log(`  cod_e=${l.codigo_escala} cod_u=${l.codigo_unitrac} nome="${l.nome}" lat=${l.lat} lng=${l.lng} r=${l.raio_metros}`)

  // Carrega GPS
  const files = readdirSync(pasta)
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta}/${pdfFile}`), new Set()).catch(() => []))

  const paradas: any[] = []
  for (const v of veiculos) {
    for (const p of v.paradas) {
      paradas.push({ ...p, placa_norm: v.placa_norm, id: `${v.placa_norm}-${paradas.length}` })
    }
  }
  const variantesPlaca = new Set(variantesOcr(PLACA_ALVO))
  const paradasPlaca = paradas.filter(p => variantesPlaca.has(p.placa_norm))

  console.log(`\n--- DISTANCIAS de cada parada (com lat/lng) p/ Loja 47, Loja 30, Loja 21 ---`)
  const l47cad = (l47 || []).find(l => l.codigo_unitrac === '47' || l.codigo_escala === '47' || /47/.test(l.nome))
  const l30cad = (lL30 || []).find(l => l.codigo_unitrac === '30' || l.codigo_escala === '30')
  const l21cad = (lL30 || []).find(l => l.codigo_unitrac === '21' || l.codigo_escala === '21')

  console.log(`  Loja 47: ${l47cad?.lat},${l47cad?.lng} raio=${l47cad?.raio_metros}`)
  console.log(`  Loja 30: ${l30cad?.lat},${l30cad?.lng} raio=${l30cad?.raio_metros}`)
  console.log(`  Loja 21: ${l21cad?.lat},${l21cad?.lng} raio=${l21cad?.raio_metros}`)

  for (const p of paradasPlaca.sort((a:any,b:any) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())) {
    const lat = (p as any).lat, lng = (p as any).lng
    if (lat == null || lng == null) {
      console.log(`  ${fmtT(p.chegada)} class=${p.classificacao} SEM_LATLNG`)
      continue
    }
    const dL47 = l47cad?.lat ? Math.round(haversine(lat, lng, l47cad.lat, l47cad.lng)) : -1
    const dL30 = l30cad?.lat ? Math.round(haversine(lat, lng, l30cad.lat, l30cad.lng)) : -1
    const dL21 = l21cad?.lat ? Math.round(haversine(lat, lng, l21cad.lat, l21cad.lng)) : -1
    console.log(`  ${fmtT(p.chegada)} class=${p.classificacao.padEnd(10)} L47=${String(dL47).padStart(6)}m L30=${String(dL30).padStart(6)}m L21=${String(dL21).padStart(6)}m`)
  }
  process.exit(0)
})()
