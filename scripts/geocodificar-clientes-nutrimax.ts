// Geocodifica a "Relação clientes.xlsx" da Nutry Max (577 lojas) e salva em
// nutrimax_clientes_geo. Roda UMA VEZ (ou quando a planilha mudar) — não faz
// parte do app em uso normal. Uso: npx tsx scripts/geocodificar-clientes-nutrimax.ts <caminho-xlsx>
import { config } from 'dotenv'; config({ path: '.env.local' })
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { criarLimitador } from '../src/lib/kpi-nutrimax/km-ors'

const ORS_URL = 'https://api.openrouteservice.org/geocode/search/structured'
// Mesmo raciocínio do km-ors.ts: espaça em vez de confiar num limite por
// janela — o tier free do ORS se comporta como token-bucket. 1.5s dá folga.
const INTERVALO_MS = 1500

type LinhaPlanilha = {
  codigo: string
  loja: string
  razaoSocial: string
  nomeFantasia: string
  endereco: string
  bairro: string
  estado: string
  cep: string
  municipio: string
}

type Geocodificado = {
  lat: number
  lng: number
  accuracy: string
  label: string
}

function raioParaAccuracy(accuracy: string): number {
  if (accuracy === 'point') return 150
  if (accuracy === 'street') return 300
  return 500 // centroid, locality, ou pior
}

async function geocodificar(linha: LinhaPlanilha, apiKey: string): Promise<Geocodificado | null> {
  const params = new URLSearchParams({
    address: linha.endereco,
    locality: linha.municipio,
    region: linha.estado || 'RJ',
    country: 'BR',
  })
  if (linha.cep) params.set('postalcode', linha.cep)
  try {
    const res = await fetch(`${ORS_URL}?${params.toString()}`, {
      headers: { Authorization: apiKey },
    })
    if (!res.ok) return null
    const json = await res.json() as { features?: Array<{ geometry: { coordinates: [number, number] }; properties: { accuracy: string; label: string } }> }
    const f = json.features?.[0]
    if (!f) return null
    return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], accuracy: f.properties.accuracy, label: f.properties.label }
  } catch {
    return null
  }
}

async function lerPlanilha(caminho: string): Promise<LinhaPlanilha[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(caminho)
  const ws = wb.worksheets[0]
  const linhas: LinhaPlanilha[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const nomeFantasia = String(row.getCell(5).value ?? '').trim()
    const endereco = String(row.getCell(6).value ?? '').trim()
    if (!nomeFantasia || !endereco) continue
    linhas.push({
      codigo: String(row.getCell(2).value ?? '').trim(),
      loja: String(row.getCell(3).value ?? '').trim(),
      razaoSocial: String(row.getCell(4).value ?? '').trim(),
      nomeFantasia,
      endereco,
      bairro: String(row.getCell(7).value ?? '').trim(),
      estado: String(row.getCell(8).value ?? '').trim(),
      cep: String(row.getCell(9).value ?? '').trim(),
      municipio: String(row.getCell(10).value ?? '').trim(),
    })
  }
  return linhas
}

async function main() {
  const caminho = process.argv[2]
  if (!caminho) {
    console.error('uso: npx tsx scripts/geocodificar-clientes-nutrimax.ts <caminho-xlsx>')
    process.exit(1)
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const orsKey = process.env.ORS_API_KEY!
  const svc = createClient(supabaseUrl, serviceKey)

  const linhas = await lerPlanilha(caminho)
  console.log(`${linhas.length} lojas na planilha. Geocodificando (1 a cada ${INTERVALO_MS}ms, ~${Math.round(linhas.length * INTERVALO_MS / 60000)} min)...`)

  const aguardarVaga = criarLimitador(INTERVALO_MS, Date.now() + linhas.length * INTERVALO_MS * 2)

  let ok = 0, semResultado = 0, erro = 0
  const porAccuracy = new Map<string, number>()
  const linhasParaInserir: Record<string, unknown>[] = []

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]
    await aguardarVaga()
    const geo = await geocodificar(l, orsKey)
    if (!geo) {
      semResultado++
      console.log(`[${i + 1}/${linhas.length}] SEM RESULTADO — ${l.nomeFantasia} — ${l.endereco}`)
      continue
    }
    ok++
    porAccuracy.set(geo.accuracy, (porAccuracy.get(geo.accuracy) ?? 0) + 1)
    linhasParaInserir.push({
      nome_fantasia: l.nomeFantasia,
      razao_social: l.razaoSocial || null,
      endereco: l.endereco,
      bairro: l.bairro || null,
      municipio: l.municipio || null,
      cep: l.cep || null,
      lat: geo.lat,
      lng: geo.lng,
      accuracy: geo.accuracy,
      raio_m: raioParaAccuracy(geo.accuracy),
    })
    if ((i + 1) % 50 === 0) console.log(`[${i + 1}/${linhas.length}] progresso... (${ok} ok, ${semResultado} sem resultado)`)
  }

  console.log(`\nGeocodificação: ${ok} ok, ${semResultado} sem resultado, ${erro} erro.`)
  console.log('Por precisão:', Object.fromEntries(porAccuracy))

  // limpa e reinsere (script é idempotente — pode rodar de novo se a planilha mudar)
  await svc.from('nutrimax_clientes_geo').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const CHUNK = 200
  for (let i = 0; i < linhasParaInserir.length; i += CHUNK) {
    const { error } = await svc.from('nutrimax_clientes_geo').insert(linhasParaInserir.slice(i, i + CHUNK))
    if (error) { console.error('erro ao inserir chunk', i, error.message); process.exit(1) }
  }
  console.log(`${linhasParaInserir.length} linhas salvas em nutrimax_clientes_geo.`)
}

main()
