import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

;(async () => {
  const { data, error } = await sb.from('escala_linhas').select('data_entrega, rede_id').eq('rede_id', 'ZONA_SUL').limit(10)
  if (error) { console.error(error); return }
  console.log('Sample ZS rows:', JSON.stringify(data?.slice(0,5), null, 2))
  const datas = [...new Set(data?.map(d => d.data_entrega))].sort()
  console.log('data_entrega values:', datas)
})()
