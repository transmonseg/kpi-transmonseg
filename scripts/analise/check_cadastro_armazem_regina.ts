import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

;(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  // Lojas REGINA + ARMAZEM_GRAO
  const { data } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, ativo')
    .in('rede_id', ['ARMAZEM_GRAO', 'REGINA'])
    .eq('ativo', true)
    .order('rede_id')
    .order('nome')
  console.log(`Total lojas ARMAZEM+REGINA: ${data?.length ?? 0}\n`)
  for (const l of data ?? []) {
    const geo = l.lat && l.lng ? `${l.lat},${l.lng} r=${l.raio_metros}m` : 'SEM-GEO'
    console.log(`  ${l.rede_id.padEnd(13)} ${(l.nome ?? '').slice(0,40).padEnd(40)} cod-esc=${(l.codigo_escala ?? '-').padEnd(10)} cod-uni=${(l.codigo_unitrac ?? '-').padEnd(10)} ${geo}`)
  }

  // Conta sem geo
  const semGeo = (data ?? []).filter(l => !l.lat || !l.lng)
  console.log(`\nSem lat/lng: ${semGeo.length}/${data?.length ?? 0}`)
})()
