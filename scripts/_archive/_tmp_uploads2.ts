import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

;(async () => {
  const { data, error } = await sb.from('escala_uploads').select('*').limit(1)
  if (error) { console.error(error.message); return }
  if (data?.length) {
    console.log('Colunas:', Object.keys(data[0]))
    console.log('Amostra:', JSON.stringify(data[0], null, 2))
  }
})()
