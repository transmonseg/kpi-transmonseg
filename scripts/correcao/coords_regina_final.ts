// FINAL — coords baseadas em dia 20 GILSON QSZ9A20 (manual com 4 paradas, ordem cronológica clara)
// + endereços oficiais aba ENDEREÇOS:
//   A.Lucio Meira = Av Lucio Meira 85 Várzea Teresópolis
//   A.Maio (1 MAIO) = Rua Waldir Barbosa Moreira 257 Várzea
//   A.Alto (ABASTECEDORA) = Av Oliveira Botelho 328 Alto
//   A.Barra do Imbui = Av Pres Roosevelt 1360 Paineira

import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const ATUALIZACOES = [
  // Dia 20 GPS QSZ9A20: 14:24 -22.41334, -42.97048 (13min) = LUCIO MEIRA (manual 14:25)
  { nome: 'REGINA LUCIO MEIRA',               lat: -22.4133, lng: -42.9705, raio: 200, fonte: 'GPS d20 QSZ9A20 14:24 (manual LUCIO 14:25)' },
  // Dia 20 GPS QSZ9A20: 14:45 -22.43862, -42.97962 (22min) = ABASTECEDORA (manual 14:45)
  { nome: 'ABASTECEDORA GRAO DA SERRA (ALTO)',lat: -22.4386, lng: -42.9796, raio: 250, fonte: 'GPS d20 QSZ9A20 14:45 (manual ABAST 14:45) — bate Alto' },
  // Dia 20 GPS QSZ9A20: 15:14 -22.41683, -42.96977 (11min) = 1 MAIO (manual 15:15)
  { nome: 'REGINA 1 DE MAIO',                 lat: -22.4168, lng: -42.9698, raio: 200, fonte: 'GPS d20 QSZ9A20 15:14 (manual 1 MAIO 15:15)' },
  // Dia 20 GPS QSZ9A20: 15:38 -22.40043, -42.97903 (95min) = BARRA IMBUY (manual 15:40)
  { nome: 'REGINA BARRA DO IMBUY',            lat: -22.4004, lng: -42.9790, raio: 200, fonte: 'GPS d20 QSZ9A20 15:38 (manual IMBUY 15:40)' },
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
