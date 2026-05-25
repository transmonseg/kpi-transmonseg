import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

// Coords corretas validadas:
// - Petrópolis: site oficial + Nominatim
// - Teresópolis: endereços CNPJ + Nominatim
// - ITAIPAVA: coord da entrega real (LSL9670 dia 19 cod 5353003)
const ATUALIZACOES: Array<{ nome: string; lat: number; lng: number; raio?: number; fonte: string }> = [
  { nome: 'ABASTECEDORA GRAO DA SERRA (ALTO)', lat: -22.4419681, lng: -42.9806098, raio: 250, fonte: 'Av Oliveira Botelho 328 Alto Teresópolis' },
  { nome: 'ARMAZEM DO GRAO (16 DE MARCO)',     lat: -22.5105970, lng: -43.1782413, raio: 200, fonte: 'Rua 16 de Março 195 Centro Petrópolis' },
  { nome: 'ARMAZEM DO GRAO (BARRA DA TIJUCA)', lat: -23.0062700, lng: -43.4317400, raio: 200, fonte: 'entrega real LQE5E01 cod 5353011' },
  { nome: 'ARMAZEM DO GRAO (BOA VISTA)',       lat: -22.3524305, lng: -43.1202469, raio: 300, fonte: 'Est União Indústria 12235 (Boa Vista=Itaipava)' },
  { nome: 'ARMAZEM DO GRAO (CAPELA)',          lat: -22.5127771, lng: -43.2193778, raio: 200, fonte: 'Rua Dr Paulo Hervê 955 Bingen' },
  { nome: 'ARMAZEM DO GRAO (CORREAS)',         lat: -22.4414700, lng: -43.1382200, raio: 200, fonte: 'entrega real LSL9670 cod 5353006' },
  { nome: 'ARMAZEM DO GRAO (ITAIPAVA)',        lat: -22.4152100, lng: -43.1400400, raio: 200, fonte: 'entrega real LSL9670 cod 5353003' },
  { nome: 'ARMAZEM DO GRAO (MOSELA)',          lat: -22.4998334, lng: -43.1994438, raio: 200, fonte: 'Rua Mosela 983' },
  { nome: 'ARMAZEM DO GRAO (QUITANDINHA)',     lat: -22.5326320, lng: -43.2052958, raio: 200, fonte: 'Rua General Rondon 550' },
  { nome: 'ARMAZEM DO GRAO (VALPARAISO)',      lat: -22.5185778, lng: -43.1912736, raio: 200, fonte: 'Valparaíso Petrópolis' },
  { nome: 'ARMAZEM DO GRAO MATRIZ (POSSE)',    lat: -22.2523000, lng: -43.0738000, raio: 300, fonte: 'Distrito da Posse Petrópolis' },
  { nome: 'REGINA 1 DE MAIO',                  lat: -22.4165005, lng: -42.9703507, raio: 200, fonte: 'Rua Primeiro de Maio 165 (frente Rodoviária Teresópolis)' },
  { nome: 'REGINA BARRA DO IMBUY',             lat: -22.4006975, lng: -42.9787159, raio: 200, fonte: 'Av Pres Roosevelt 1360 Barra do Imbuí' },
  { nome: 'REGINA LUCIO MEIRA',                lat: -22.4141360, lng: -42.9705951, raio: 200, fonte: 'Av Lúcio Meira 85 Várzea' },
]

const DRY_RUN = process.argv.includes('--apply') ? false : true

;(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: lojas } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, lat, lng, raio_metros')
    .eq('rede_id', 'ARMAZEM_GRAO')
    .eq('ativo', true)

  function dist(a: {lat:number, lng:number}, b: {lat:number, lng:number}) {
    const toRad = (x:number) => x * Math.PI / 180
    const R = 6371e3
    const dLat = toRad(b.lat - a.lat); const dLon = toRad(b.lng - a.lng)
    const sa = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2
    return 2 * R * Math.asin(Math.sqrt(sa))
  }

  console.log(`Modo: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`)
  console.log('═══ DIFF cadastro → novo ═══\n')

  for (const u of ATUALIZACOES) {
    const loja = lojas?.find(l => l.nome === u.nome)
    if (!loja) { console.log(`✗ ${u.nome} NÃO ACHADO no banco`); continue }
    const d = loja.lat && loja.lng ? dist({lat: loja.lat, lng: loja.lng}, {lat: u.lat, lng: u.lng}) : 0
    const drift = d > 1000 ? `🔥 ${(d/1000).toFixed(1)}km` : `${d.toFixed(0)}m`
    console.log(`  ${u.nome.padEnd(40)} drift=${drift.padStart(10)}  raio=${loja.raio_metros}→${u.raio ?? loja.raio_metros}`)
    console.log(`    de:  ${loja.lat}, ${loja.lng}`)
    console.log(`    pra: ${u.lat}, ${u.lng}   (${u.fonte})`)

    if (!DRY_RUN) {
      const { error } = await supabase
        .from('lojas')
        .update({ lat: u.lat, lng: u.lng, raio_metros: u.raio ?? loja.raio_metros })
        .eq('id', loja.id)
      if (error) console.log(`    ❌ ERRO: ${error.message}`)
      else console.log(`    ✅ aplicado`)
    }
  }
  console.log(`\n${DRY_RUN ? 'Para aplicar, rode com --apply' : 'Updates aplicados'}`)
})()
