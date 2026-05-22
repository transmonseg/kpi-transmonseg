// Validação ponta-a-ponta FASE 2 - verifica geofences das 5 lojas faltantes
// Execução: npx tsx scripts/validate-fase2.mjs

import { parseUnitracPdf } from '../src/lib/parsers/unitrac-pdf.ts'
import fs from 'fs'

const UNITRAC_PDF_PATH =
  'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/relatorio_9553.pdf'

// Placas que antes apareciam como "geofence ausente" no cruzamento dia 20.
// Fase 1 corrigiu o OCR de LJS2B72 -> LJS2172.
// LJS2B72 era a forma raw do OCR; no cadastro ela estava como LJS2172.
const PLACAS_FOCO = new Set(['LJS2172', 'LJS2B72', 'LMF2049', 'LRA9C41'])

// Novas geofences adicionadas na Fase 2
// Coords corrigidas via migration 20260522020000_corrigir_coords_fase2.sql
// (centroide de paradas reais ≥15 min do PDF relatorio_9553.pdf, dia 20/05/2026)
const GEOFENCES = {
  norte_shopping: { lat: -22.885575, lng: -43.285680, label: 'Carrefour Norte Shopping' },
  niteroi_barcas: { lat: -22.888470, lng: -43.123890, label: 'Princesa Niteroi Barcas' },
  iguaba:         { lat: -22.840650, lng: -42.223430, label: 'Princesa Iguaba' },
  itaborai:       { lat: -22.745530, lng: -42.852585, label: 'Princesa Itaborai' },
}

const MATCH_THRESHOLD_M = 200

// ─── Haversine ────────────────────────────────────────────────────────────────
const EARTH_RADIUS_M = 6371000
function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Calcula menor distancia de uma parada para cada geofence ─────────────────
function distanciasParaGeofences(parada) {
  const result = {}
  for (const [key, gf] of Object.entries(GEOFENCES)) {
    if (parada.lat === null || parada.lng === null) {
      result[key] = null
    } else {
      result[key] = Math.round(haversine(parada.lat, parada.lng, gf.lat, gf.lng))
    }
  }
  return result
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
console.log('\n=== VALIDATE FASE 2 - Geofences novas lojas ===\n')

if (!fs.existsSync(UNITRAC_PDF_PATH)) {
  console.error('PDF nao encontrado:', UNITRAC_PDF_PATH)
  process.exit(1)
}

const buf = fs.readFileSync(UNITRAC_PDF_PATH)

// Cadastro com as placas corrigidas (OCR fix do Fase 1 + as novas)
const PLACAS_CADASTRO = new Set([
  'LCO0978', 'LQE5401', 'LJS2172', 'EFU5704', 'LMF2049', 'LRA9C41',
])

const resumos = await parseUnitracPdf(buf, PLACAS_CADASTRO)
const placasEncontradas = new Set(resumos.map(r => r.placa_norm))

console.log(`Total veiculos no PDF: ${resumos.length}`)
console.log(`Placas norm encontradas: ${[...placasEncontradas].sort().join(', ')}\n`)

// Filtra apenas veiculos de interesse
const veiculosFoco = resumos.filter(r =>
  PLACAS_FOCO.has(r.placa_norm) || PLACAS_FOCO.has(r.placa_raw?.replace('-', ''))
)

if (veiculosFoco.length === 0) {
  console.warn('ATENCAO: Nenhuma das placas foco foi encontrada no PDF.')
  console.warn('Placas foco:', [...PLACAS_FOCO].join(', '))
  console.warn('Verifique se o PDF contem essas placas.\n')
}

// Para cada veiculo foco, analisa todas as paradas classificadas como LOJA
// e calcula distancias para as novas geofences
const analise = {}
for (const v of veiculosFoco) {
  const paradaAnalise = []
  for (const p of v.paradas) {
    if (p.classificacao !== 'LOJA' && p.classificacao !== 'FORA_BASE') continue
    const dists = distanciasParaGeofences(p)
    const entries = Object.entries(dists).filter(([, d]) => d !== null)
    const [nearestKey, nearestDist] = entries.sort(([, a], [, b]) => a - b)[0] ?? [null, null]
    paradaAnalise.push({
      ordem: p.ordem,
      local_parada: p.local_parada,
      lat: p.lat,
      lng: p.lng,
      classificacao: p.classificacao,
      distancias: dists,
      nearest_geofence: nearestKey,
      nearest_dist_m: nearestDist,
      match: nearestDist !== null && nearestDist < MATCH_THRESHOLD_M,
    })
  }
  analise[v.placa_norm] = paradaAnalise

  console.log(`\n--- ${v.placa_norm} (raw: ${v.placa_raw}) ---`)
  console.log(`  Paradas totais: ${v.paradas.length}`)
  console.log(`  Paradas LOJA/FORA_BASE analisadas: ${paradaAnalise.length}`)
  for (const pa of paradaAnalise) {
    const matchStr = pa.match ? 'MATCH <200m' : (pa.nearest_dist_m !== null ? `${pa.nearest_dist_m}m` : 'sem coords')
    console.log(`  [${pa.ordem}] ${pa.local_parada.slice(0, 60)} | nearest: ${pa.nearest_geofence} (${matchStr})`)
    if (pa.lat !== null) {
      for (const [gfKey, dist] of Object.entries(pa.distancias)) {
        const gf = GEOFENCES[gfKey]
        console.log(`       ${gf.label}: ${dist}m`)
      }
    }
  }
}

// ─── Extrai metricas consolidadas para o JSON final ───────────────────────────
function melhorDistancia(placa, geofenceKey) {
  const paradas = analise[placa]
  if (!paradas || paradas.length === 0) return null
  const dists = paradas
    .map(p => p.distancias?.[geofenceKey])
    .filter(d => d !== null && d !== undefined)
  if (dists.length === 0) return null
  return Math.min(...dists)
}

const ljs2172_norte_shopping = melhorDistancia('LJS2172', 'norte_shopping')
const lmf2049_niteroi_barcas = melhorDistancia('LMF2049', 'niteroi_barcas')
const lra9c41_iguaba         = melhorDistancia('LRA9C41', 'iguaba')
const lra9c41_itaborai       = melhorDistancia('LRA9C41', 'itaborai')

// Considera match se pelo menos uma parada ficou dentro do raio
const matches = [
  ljs2172_norte_shopping,
  lmf2049_niteroi_barcas,
  lra9c41_iguaba,
  lra9c41_itaborai,
].filter(d => d !== null)

const algumMatchFunciona = matches.some(d => d < MATCH_THRESHOLD_M)

// Aprovado apenas se TODAS as placas encontradas tiverem pelo menos 1 match < 200m
// (placas ausentes no PDF sao ignoradas, nao penalizam)
const placasComParadas = Object.keys(analise).filter(pl => analise[pl].length > 0)
const todosMatcham = placasComParadas.length === 0
  ? false // nao pode aprovar sem nenhuma placa
  : placasComParadas.every(pl => {
      const paradas = analise[pl]
      return paradas.some(pa => pa.match)
    })

const resultado = {
  LJS2172_norte_shopping_dist_m: ljs2172_norte_shopping,
  LMF2049_niteroi_barcas_dist_m: lmf2049_niteroi_barcas,
  LRA9C41_iguaba_dist_m: lra9c41_iguaba,
  LRA9C41_itaborai_dist_m: lra9c41_itaborai,
  matches_funcionam: todosMatcham,
  veredicto: todosMatcham ? 'APROVADO' : 'REJEITADO',
  _meta: {
    placas_foco_no_pdf: veiculosFoco.map(v => v.placa_norm),
    placas_com_match: placasComParadas.filter(pl => analise[pl].some(pa => pa.match)),
    threshold_metros: MATCH_THRESHOLD_M,
    total_veiculos_pdf: resumos.length,
  },
}

console.log('\n=== RESULTADO FINAL ===')
console.log(JSON.stringify(resultado, null, 2))
