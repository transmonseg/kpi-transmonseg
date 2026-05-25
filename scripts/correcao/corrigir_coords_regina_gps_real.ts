// Atualiza coords REGINA + ABASTECEDORA com paradas GPS REAIS triangulações
// dia 19 (TML6D96) + dia 21 (QSU6I54), não Nominatim.

import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

// Triangulação:
// - Dia 19 TML6D96: 14:20-14:27 (-22.4133,-42.9707) 7min, 14:37-14:56 (-22.4386,-42.9796) 19min, 15:05-15:27 (-22.4167,-42.9699) 22min
// - Dia 21 QSU6I54: 14:51-14:55 (-22.4133,-42.9705) 4min, 15:04-15:22 (-22.4386,-42.9796) 18min, 15:42-15:47 (-22.4166,-42.9696) 5min, 16:00-17:10 (-22.4004,-42.9791) 71min
//
// Coord A (-22.4133): 4 paradas (curtas) - REGINA 1 DE MAIO (Várzea norte)
// Coord B (-22.4386): 2 paradas (longas) - ABASTECEDORA ALTO (Alto, mais ao sul)
// Coord C (-22.4167): 2 paradas (médias) - REGINA LUCIO MEIRA (Várzea centro)
// Coord D (-22.4004): 1 parada (71min, mais longa) - REGINA BARRA DO IMBUY (norte cidade)
//
// Endereços CNPJ corroboram:
// - REGINA 1 DE MAIO: R. Primeiro de Maio 165 Várzea (centro/rodoviária)
// - REGINA LUCIO MEIRA: Av. Lúcio Meira 85 Várzea (centro)
// - ABASTECEDORA: Av. Oliveira Botelho 328 Alto (sul, mais alto)
// - REGINA BARRA DO IMBUY: Av. Pres. Roosevelt 1360 Barra do Imbuí (norte)
//
// "Alto" em Teresópolis fica geográficamente ao sul = lat menor (-22.43)
// "Barra do Imbuí" ao norte = lat maior (-22.40)

const ATUALIZACOES: Array<{ nome: string; lat: number; lng: number; raio: number; fonte: string }> = [
  { nome: 'REGINA 1 DE MAIO',                 lat: -22.4133, lng: -42.9707, raio: 200, fonte: 'GPS real TML6D96 d19 14:20 + QSU6I54 d21 14:51' },
  { nome: 'REGINA LUCIO MEIRA',               lat: -22.4167, lng: -42.9699, raio: 200, fonte: 'GPS real TML6D96 d19 15:05 + QSU6I54 d21 15:42' },
  { nome: 'ABASTECEDORA GRAO DA SERRA (ALTO)',lat: -22.4386, lng: -42.9796, raio: 250, fonte: 'GPS real TML6D96 d19 14:37 + QSU6I54 d21 15:04 (Alto = sul)' },
  { nome: 'REGINA BARRA DO IMBUY',            lat: -22.4004, lng: -42.9791, raio: 200, fonte: 'GPS real QSU6I54 d21 16:00 (71min — entrega longa)' },
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
