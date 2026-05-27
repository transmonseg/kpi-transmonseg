import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

;(async () => {
  // Ver uma linha de amostra para entender o schema
  const { data, error } = await sb.from('escala_linhas').select('*').eq('rede_id', 'ZONA_SUL').limit(1)
  if (error) { console.error(error.message); return }
  if (data?.length) {
    const cols = Object.keys(data[0])
    console.log('Colunas em escala_linhas:', cols)
    console.log('\nAmostra:', JSON.stringify(data[0], null, 2))
  }
})()
