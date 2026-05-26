// Coords REGINA derivadas do MANUAL da Tia Érica (verdade) + GPS dia 19/21.
// Manual diz: ordem cronológica = 1MAIO 14:20 → LUCIO 14:35 → ABASTECEDORA 15:05 → IMBUY 15:40
// GPS TML6D96 dia 19 paradas em Teresópolis (cronológicas):
//   14:20 -22.4133,-42.9707
//   14:37 -22.4386,-42.9796
//   15:05 -22.4167,-42.9699
// Match 1:1 manual×GPS:

import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const ATUALIZACOES = [
  { nome: 'REGINA 1 DE MAIO',                 lat: -22.4133, lng: -42.9707, raio: 200, fonte: 'manual+GPS d19 14:20 (1ª parada cronológica)' },
  { nome: 'REGINA LUCIO MEIRA',               lat: -22.4386, lng: -42.9796, raio: 200, fonte: 'manual+GPS d19 14:37 (2ª parada, manual 14:35)' },
  { nome: 'ABASTECEDORA GRAO DA SERRA (ALTO)',lat: -22.4167, lng: -42.9699, raio: 200, fonte: 'manual+GPS d19 15:05 (3ª parada, manual 15:05)' },
  { nome: 'REGINA BARRA DO IMBUY',            lat: -22.4004, lng: -42.9791, raio: 200, fonte: 'manual+GPS d21 16:00 (71min — entrega longa)' },
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
    if (!loja) { console.log(`✗ ${u.nome} não achado`); continue }
    const d = loja.lat && loja.lng ? dist({lat: loja.lat, lng: loja.lng}, {lat: u.lat, lng: u.lng}) : 0
    console.log(`${u.nome.padEnd(40)} drift=${d.toFixed(0)}m`)
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
