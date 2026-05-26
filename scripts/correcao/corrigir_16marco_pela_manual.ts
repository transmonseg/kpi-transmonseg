// ARMAZEM 16 DE MARCO real está em coord da parada GPS, não no "Centro" do Nominatim.
// Manual UDC6I03 dia 19: 16 DE MARÇO 16:00.
// GPS UDC6I03 dia 19: parada 16:00-16:20 em -22.51418, -43.21547.

import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const ATUALIZACOES = [
  { nome: 'ARMAZEM DO GRAO (16 DE MARCO)', lat: -22.5142, lng: -43.2155, raio: 200, fonte: 'manual+GPS JAIRO d19 16:00-16:20' },
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
    .select('id, nome, lat, lng, raio_metros')
    .eq('rede_id', 'ARMAZEM_GRAO')
    .eq('ativo', true)

  function dist(a:{lat:number,lng:number}, b:{lat:number,lng:number}): number {
    const toRad = (x:number) => x * Math.PI / 180
    const R = 6371e3
    const dLat = toRad(b.lat - a.lat); const dLon = toRad(b.lng - a.lng)
    const sa = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2
    return 2 * R * Math.asin(Math.sqrt(sa))
  }

  console.log(`Modo: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`)
  for (const u of ATUALIZACOES) {
    const loja = lojas?.find(l => l.nome === u.nome)
    if (!loja) { console.log(`✗ ${u.nome}`); continue }
    const d = loja.lat && loja.lng ? dist({lat: loja.lat, lng: loja.lng}, {lat: u.lat, lng: u.lng}) : 0
    console.log(`${u.nome}: drift=${d.toFixed(0)}m`)
    console.log(`  de:  ${loja.lat},${loja.lng}`)
    console.log(`  pra: ${u.lat},${u.lng}  (${u.fonte})`)
    if (!DRY_RUN) {
      const { error } = await supabase
        .from('lojas')
        .update({ lat: u.lat, lng: u.lng, raio_metros: u.raio })
        .eq('id', loja.id)
      console.log(error ? `  ❌ ${error.message}` : `  ✅ aplicado`)
    }
  }
})()
