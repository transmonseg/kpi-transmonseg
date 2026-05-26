// Fase 1.2: lista cadastro ZS atual + diff vs lojas oficiais
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

;(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojas } = await sb
    .from('lojas')
    .select('id, nome, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, ativo')
    .eq('rede_id', 'ZONA_SUL')
    .eq('ativo', true)
    .order('nome')

  console.log(`Total ZONA_SUL ativas: ${lojas?.length}\n`)
  // Agrupa por número da loja (extrai do nome)
  for (const l of lojas ?? []) {
    const num = l.nome.match(/\d+/)?.[0] ?? '?'
    const geo = l.lat && l.lng ? `${l.lat.toFixed(4)},${l.lng.toFixed(4)} r=${l.raio_metros}m` : 'SEM-GEO'
    console.log(`  ${num.padStart(4)} | ${l.nome.padEnd(35)} cod-esc=${(l.codigo_escala ?? '-').padEnd(8)} cod-uni=${(l.codigo_unitrac ?? '-').padEnd(10)} ${geo}`)
  }

  const semGeo = (lojas ?? []).filter(l => !l.lat || !l.lng)
  console.log(`\nSem geo: ${semGeo.length}`)
})()
