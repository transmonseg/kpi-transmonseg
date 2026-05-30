import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
async function main() {
  const r = await supabase.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, sub_rede, entrega_d1_fixo').eq('ativo', true)
  console.log('err:', r.error)
  console.log('count:', r.data?.length)
  console.log('sample[0]:', r.data?.[0])
}
main()
