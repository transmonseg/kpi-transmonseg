import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

;(async () => {
  const { data } = await sb.from('lojas').select('id, nome, lat, lng, raio_metros, codigo_escala, codigo_unitrac, nome_unitrac').eq('rede_id','ARMAZEM_GRAO').order('nome')
  for (const l of data || []) {
    console.log(`${(l.nome ?? '').padEnd(40)} lat=${l.lat} lng=${l.lng} raio=${l.raio_metros} cod_u=${l.codigo_unitrac} nome_u=${l.nome_unitrac}`)
  }
})()
