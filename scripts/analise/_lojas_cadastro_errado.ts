/**
 * Pra cada cod_loja que aparece no Unitrac (3 dias), compara lat/lng GPS médio
 * das paradas com cadastro no banco. Lista lojas com discrepância > 500m e
 * lojas sem cadastro.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { createClient } from '@supabase/supabase-js'

const PDFS = [
  ['19', 'docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'],
  ['20', 'docs/conversas-tia-erica/dia-20/unitrac/relatorio_9522.pdf'],
  ['25', 'docs/conversas-tia-erica/dia-25/unitrac/relatorio_9652.pdf'],
]

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: lojas } = await svc.from('lojas').select('rede_id, nome, codigo_unitrac, lat, lng, raio_metros, ativo')
  const cadMap = new Map<string, any>()
  for (const l of lojas ?? []) {
    if (l.codigo_unitrac) cadMap.set(l.codigo_unitrac as string, l)
  }

  // Pra cada cod aparecido nas paradas LOJA, coletar lat/lng + nome do PDF
  type Stat = {
    cod: string
    nomes: Set<string>
    coords: Array<{ lat: number; lng: number }>
    placas: Set<string>
    dias: Set<string>
  }
  const stats = new Map<string, Stat>()

  for (const [dia, pdf] of PDFS) {
    const veiculos = await parseUnitracPdf(readFileSync(pdf), null)
    for (const v of veiculos) {
      for (const p of v.paradas) {
        if (p.classificacao !== 'LOJA') continue
        if (!p.codigo_loja || p.lat == null || p.lng == null) continue
        const s = stats.get(p.codigo_loja) ?? { cod: p.codigo_loja, nomes: new Set(), coords: [], placas: new Set(), dias: new Set() }
        if (p.nome_loja) s.nomes.add(p.nome_loja.replace(/\s+/g, ' ').trim())
        s.coords.push({ lat: p.lat, lng: p.lng })
        s.placas.add(v.placa_norm)
        s.dias.add(dia)
        stats.set(p.codigo_loja, s)
      }
    }
  }

  type Linha = {
    cod: string
    nome_pdf: string
    cad_existe: boolean
    cad_rede: string | null
    cad_nome: string | null
    cad_lat: number | null
    cad_lng: number | null
    cad_ativo: boolean | null
    paradas_count: number
    placas_count: number
    gps_lat_min: number; gps_lat_max: number
    gps_lng_min: number; gps_lng_max: number
    gps_spread_m: number
    dist_cad_m: number | null
    status: string
  }
  const linhas: Linha[] = []

  for (const s of stats.values()) {
    const cad = cadMap.get(s.cod)
    const lats = s.coords.map(c => c.lat)
    const lngs = s.coords.map(c => c.lng)
    const latMin = Math.min(...lats), latMax = Math.max(...lats)
    const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs)
    const spread = lats.length >= 2 ? haversine(latMin, lngMin, latMax, lngMax) : 0
    const latMid = (latMin + latMax) / 2, lngMid = (lngMin + lngMax) / 2
    const distCad = cad?.lat && cad?.lng ? haversine(latMid, lngMid, cad.lat, cad.lng) : null
    let status = ''
    if (!cad) status = '❌ NÃO CADASTRADO'
    else if (cad.lat == null || cad.lng == null) status = '⚠️ cadastrado SEM lat/lng'
    else if (distCad != null && distCad > 5000) status = `❌ cadastro distante ${Math.round(distCad/1000)}km`
    else if (distCad != null && distCad > 500) status = `⚠️ cadastro divergente ${Math.round(distCad)}m`
    else if (spread > 5000) status = `⚠️ GPS spread ${Math.round(spread/1000)}km (geofence cobre área enorme)`
    else status = '✅ ok'
    linhas.push({
      cod: s.cod,
      nome_pdf: [...s.nomes][0] ?? '?',
      cad_existe: !!cad,
      cad_rede: cad?.rede_id ?? null,
      cad_nome: cad?.nome ?? null,
      cad_lat: cad?.lat ?? null,
      cad_lng: cad?.lng ?? null,
      cad_ativo: cad?.ativo ?? null,
      paradas_count: s.coords.length,
      placas_count: s.placas.size,
      gps_lat_min: latMin, gps_lat_max: latMax,
      gps_lng_min: lngMin, gps_lng_max: lngMax,
      gps_spread_m: spread,
      dist_cad_m: distCad,
      status,
    })
  }

  linhas.sort((a, b) => {
    const ordem = { '❌': 0, '⚠️': 1, '✅': 2 } as Record<string, number>
    const ka = ordem[a.status[0]] ?? 3
    const kb = ordem[b.status[0]] ?? 3
    if (ka !== kb) return ka - kb
    return b.paradas_count - a.paradas_count
  })

  const out: string[] = ['# Lojas com cadastro problemático (3 dias: 19/20/25)\n']
  out.push(`Total cods únicos: ${linhas.length}\n`)
  for (const l of linhas) {
    out.push(`\n## cod=${l.cod} — ${l.nome_pdf}`)
    out.push(`- **Status**: ${l.status}`)
    out.push(`- Cadastro: ${l.cad_existe ? `[${l.cad_rede}] ${l.cad_nome} lat=${l.cad_lat} lng=${l.cad_lng} ativo=${l.cad_ativo}` : '(não existe)'}`)
    out.push(`- GPS: ${l.paradas_count} paradas, ${l.placas_count} placas, lat=${l.gps_lat_min.toFixed(4)}~${l.gps_lat_max.toFixed(4)} lng=${l.gps_lng_min.toFixed(4)}~${l.gps_lng_max.toFixed(4)}`)
    if (l.dist_cad_m != null) out.push(`- Distância cadastro vs GPS médio: ${Math.round(l.dist_cad_m)}m`)
    if (l.gps_spread_m > 1000) out.push(`- ⚠️ GPS spread: ${Math.round(l.gps_spread_m)}m (geofence cobre região grande)`)
  }

  writeFileSync('docs/conversas-tia-erica/LOJAS-CADASTRO-AUDITORIA.md', out.join('\n'))
  console.log(`OK ${linhas.length} cods analisados → docs/conversas-tia-erica/LOJAS-CADASTRO-AUDITORIA.md`)
  const stats2 = { naoCad: 0, semGeo: 0, muitoDistante: 0, divergente: 0, spread: 0, ok: 0 }
  for (const l of linhas) {
    if (l.status.startsWith('❌ NÃO')) stats2.naoCad++
    else if (l.status.startsWith('⚠️ cadastrado SEM')) stats2.semGeo++
    else if (l.status.startsWith('❌ cadastro distante')) stats2.muitoDistante++
    else if (l.status.startsWith('⚠️ cadastro divergente')) stats2.divergente++
    else if (l.status.startsWith('⚠️ GPS spread')) stats2.spread++
    else stats2.ok++
  }
  console.log(JSON.stringify(stats2, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) })
