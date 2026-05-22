// Extrai coordenadas reais das paradas do PDF Unitrac dia 20
// para as 4 placas problemáticas, filtrando paradas longas (>15min)
// Execução: npx tsx scripts/find-real-coords.mjs

import { parseUnitracPdf } from '../src/lib/parsers/unitrac-pdf.ts'
import fs from 'fs'

const UNITRAC_PDF_PATH =
  'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/relatorio_9553.pdf'

const PLACAS_ALVO = new Set(['LJS2172', 'LJS2B72', 'LMF2049', 'LRA9C41'])
const MIN_DURACAO_MIN = 15 // paradas longas = provável entrega

// Geofences atuais (referência)
const GEOFENCES_ATUAIS = {
  norte_shopping:  { lat: -22.892,    lng: -43.282,    label: 'Carrefour Norte Shopping (9006160)' },
  niteroi_barcas:  { lat: -22.895,    lng: -43.124,    label: 'Princesa Niteroi Barcas (8590574)'  },
  iguaba:          { lat: -22.836,    lng: -42.220,    label: 'Princesa Iguaba (8590575)'           },
  itaborai:        { lat: -22.747,    lng: -42.860,    label: 'Princesa Itaborai (8590576)'         },
}

function haversine(lat1, lng1, lat2, lng2) {
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function nearestGeofence(lat, lng) {
  let nearest = null
  let minDist = Infinity
  for (const [key, gf] of Object.entries(GEOFENCES_ATUAIS)) {
    const d = haversine(lat, lng, gf.lat, gf.lng)
    if (d < minDist) { minDist = d; nearest = { key, label: gf.label, dist: Math.round(d) } }
  }
  return nearest
}

console.log('\n=== FIND REAL COORDS - Paradas longas por placa ===\n')

const buf = fs.readFileSync(UNITRAC_PDF_PATH)
const PLACAS_CADASTRO = new Set(['LCO0978','LQE5401','LJS2172','EFU5704','LMF2049','LRA9C41'])
const resumos = await parseUnitracPdf(buf, PLACAS_CADASTRO)

const alvos = resumos.filter(r =>
  PLACAS_ALVO.has(r.placa_norm) || PLACAS_ALVO.has(r.placa_raw?.replace('-', ''))
)

const resultado = {}

for (const v of alvos) {
  console.log(`\n=== ${v.placa_norm} (raw: ${v.placa_raw}) ===`)
  console.log(`  Total paradas: ${v.paradas.length}`)

  const paradasLongas = v.paradas.filter(p =>
    p.lat !== null && p.lng !== null && p.duracao_seg >= MIN_DURACAO_MIN * 60
  )

  console.log(`  Paradas ≥${MIN_DURACAO_MIN}min com coords: ${paradasLongas.length}`)

  for (const p of v.paradas) {
    const duracaoMin = Math.round(p.duracao_seg / 60)
    const coordStr = p.lat !== null ? `${p.lat}, ${p.lng}` : 'sem coords'
    const nearest = p.lat !== null ? nearestGeofence(p.lat, p.lng) : null
    const nearestStr = nearest ? `→ ${nearest.label} (${nearest.dist}m)` : ''
    const flag = p.duracao_seg >= MIN_DURACAO_MIN * 60 ? '★' : ' '
    console.log(`  ${flag}[${p.ordem}] ${duracaoMin}min | ${coordStr} | ${p.local_parada.slice(0,50)} ${nearestStr}`)
  }

  // Para cada geofence vizinha, extrai o centroide das paradas longas que ficam perto
  const centroides = {}
  for (const [gfKey, gf] of Object.entries(GEOFENCES_ATUAIS)) {
    const candidatos = paradasLongas.filter(p => {
      const d = haversine(p.lat, p.lng, gf.lat, gf.lng)
      return d < 5000 // dentro de 5km da geofence atual
    })
    if (candidatos.length === 0) continue
    const latMedia = candidatos.reduce((s, p) => s + p.lat, 0) / candidatos.length
    const lngMedia = candidatos.reduce((s, p) => s + p.lng, 0) / candidatos.length
    const latMin = Math.min(...candidatos.map(p => p.lat))
    const latMax = Math.max(...candidatos.map(p => p.lat))
    const lngMin = Math.min(...candidatos.map(p => p.lng))
    const lngMax = Math.max(...candidatos.map(p => p.lng))
    // Distância do centroide para geofence atual
    const distAtual = Math.round(haversine(latMedia, lngMedia, gf.lat, gf.lng))
    centroides[gfKey] = { latMedia, lngMedia, distAtual, n: candidatos.length, latMin, latMax, lngMin, lngMax, candidatos }
    console.log(`\n  CENTROIDE para ${gf.label}:`)
    console.log(`    n=${candidatos.length} paradas longas`)
    console.log(`    lat=${latMedia.toFixed(6)}, lng=${lngMedia.toFixed(6)}`)
    console.log(`    spread lat: ${latMin.toFixed(6)} a ${latMax.toFixed(6)}`)
    console.log(`    spread lng: ${lngMin.toFixed(6)} a ${lngMax.toFixed(6)}`)
    console.log(`    distância da geofence atual: ${distAtual}m`)
  }

  resultado[v.placa_norm] = { placa_raw: v.placa_raw, centroides }
}

console.log('\n\n=== RESUMO PARA MIGRATION SQL ===\n')
console.log('-- Geofences atuais vs coords reais das paradas:')
for (const [placa, data] of Object.entries(resultado)) {
  for (const [gfKey, c] of Object.entries(data.centroides)) {
    const gf = GEOFENCES_ATUAIS[gfKey]
    console.log(`-- ${placa} → ${gf.label}`)
    console.log(`--   atual: ${gf.lat}, ${gf.lng}`)
    console.log(`--   real:  ${c.latMedia.toFixed(6)}, ${c.lngMedia.toFixed(6)} (dist ${c.distAtual}m, n=${c.n})`)
  }
}

// Exporta JSON estruturado
const jsonSaida = 'scripts/_real_coords.json'
fs.writeFileSync(jsonSaida, JSON.stringify(resultado, null, 2))
console.log(`\nJSON salvo em ${jsonSaida}`)
