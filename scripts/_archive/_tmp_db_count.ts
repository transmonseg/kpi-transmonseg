import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

;(async () => {
  const { count } = await sb.from('escala_linhas').select('*', { count: 'exact', head: true }).eq('rede_id', 'ZONA_SUL')
  console.log('Total ZS escala_linhas:', count)

  const { data } = await sb.from('escala_linhas').select('data').eq('rede_id', 'ZONA_SUL').order('data', { ascending: false }).limit(5)
  console.log('Mais recentes:', data?.map(d => d.data))

  const { count: total } = await sb.from('escala_linhas').select('*', { count: 'exact', head: true })
  console.log('Total escala_linhas (todas redes):', total)
})()
