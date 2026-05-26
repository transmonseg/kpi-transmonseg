import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

;(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data } = await sb.from('lojas').select('id, rede_id, nome, codigo_unitrac, lat, lng, ativo').or('nome.ilike.%33%,nome.ilike.%humait%').order('nome')
  console.log(JSON.stringify(data, null, 2))
})()
