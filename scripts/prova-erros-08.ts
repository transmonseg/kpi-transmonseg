// PROVA final dos 2 erros de 08/06: cadastro vs documento oficial vs distância
// real de CADA parada do caminhão até a loja. Decide se o erro é nosso ou do relatório.
import { config } from 'dotenv'; config({ path: '.env.local' })
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const req = createRequire(import.meta.url)
const XLSX = req('xlsx')
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { haversine } from '@/lib/utils/geo'

const DL = 'C:/Users/media/Downloads'
const CASOS = [
  { placa: 'KNI8942', lojaNome: '%CAMPO GRANDE%', rede: 'GUANABARA', cod: '71011' },
  { placa: 'LCO0978', lojaNome: '%LEBLON%', rede: 'ZONA_SUL', cod: '9039101' },
]

async function fetchAll(url: string, key: string, q: string): Promise<any[]> {
  for (let t = 0; t < 4; t++) { try {
    const r = await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    if (!r.ok) throw new Error(`Supabase ${r.status}`)
    return (await r.json()) as any[]
  } catch (e) { if (t === 3) throw e } } return []
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Documento oficial
  const doc = new Map<string, any>()
  for (const r of XLSX.utils.sheet_to_json(XLSX.readFile(`${DL}/unitrac_pontointeresse_consulta (6) (2).xls`).Sheets['Consulta'], { defval: null })) {
    doc.set(String(r.IDENTIFICADOR ?? ''), { nome: r.PONTO, lat: Number(r.LATITUDE), lng: Number(r.LONGITUDE), raio: r['RAIO (m)'] })
  }

  // Relatório
  const vs = await parseUnitracPdf(readFileSync(`${DL}/relatorio_10122.pdf`), new Set(CASOS.map(c => c.placa)))

  for (const caso of CASOS) {
    console.log('\n' + '═'.repeat(78))
    console.log(`CASO ${caso.placa} → loja cod ${caso.cod}`)
    console.log('═'.repeat(78))

    // 1) Cadastro no banco
    const ls = await fetchAll(url, key, `lojas?select=nome,rede_id,codigo_unitrac,lat,lng,raio_metros,ativo&codigo_unitrac=eq.${caso.cod}`)
    const l = ls[0]
    if (!l) { console.log('  ⚠ loja não está no banco com esse código!'); continue }
    console.log(`  BANCO:     "${l.nome}" [${l.rede_id}] ativo=${l.ativo}`)
    console.log(`             cod=${l.codigo_unitrac} | ${l.lat},${l.lng} | raio=${l.raio_metros}m`)

    // 2) Documento oficial
    const d = doc.get(caso.cod)
    if (!d) { console.log('  ⚠ código não existe no DOCUMENTO!'); continue }
    const dCad = Math.round(haversine(l.lat, l.lng, d.lat, d.lng))
    console.log(`  DOCUMENTO: "${d.nome}" | ${d.lat},${d.lng} | raio=${d.raio}m`)
    console.log(`  → banco vs documento: ${dCad}m ${dCad <= 100 ? '✓ cadastro CERTO' : dCad <= 500 ? '~ aceitável' : '✗ DIVERGE!'}`)

    // 3) Cada parada do caminhão vs a loja
    const v = vs.find(v => v.placa_norm === caso.placa || v.placa_norm === caso.placa.slice(0, 4) + 'J' + caso.placa.slice(5))
      ?? vs.find(v => v.placa_norm.startsWith(caso.placa.slice(0, 3)))
    if (!v) { console.log('  ⚠ placa não encontrada no relatório'); continue }
    console.log(`  PLACA NO RELATÓRIO: ${v.placa_norm} (${v.paradas.length} paradas) — distância de cada parada ATÉ A LOJA:`)
    let maisPerto = Infinity
    for (const p of v.paradas) {
      const dist = (p.lat != null && p.lng != null) ? Math.round(haversine(l.lat, l.lng, p.lat, p.lng)) : null
      if (dist != null && dist < maisPerto) maisPerto = dist
      console.log(`     [${p.classificacao}] ${p.chegada.toISOString().slice(11, 16)}  →  ${dist != null ? (dist >= 1000 ? (dist/1000).toFixed(1) + ' km' : dist + ' m') : 'sem coord'}`)
    }
    console.log(`  ► PARADA MAIS PRÓXIMA DA LOJA: ${maisPerto >= 1000 ? (maisPerto/1000).toFixed(1) + ' km' : maisPerto + ' m'}`)
    console.log(`  ► VEREDITO: ${maisPerto <= (l.raio_metros ?? 150) ? '⚠ caminhão ESTEVE no raio — ERRO NOSSO (não creditamos!)' : maisPerto <= 500 ? '⚠ perto (≤500m) — zona cinzenta, rever' : '✓ caminhão NUNCA chegou perto da loja NESTE RELATÓRIO — dado do Unitrac, não bug nosso'}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
