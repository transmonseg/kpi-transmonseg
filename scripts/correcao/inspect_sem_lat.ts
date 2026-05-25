import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  const { data } = await supabase.from('lojas').select('id, rede_id, nome, codigo_unitrac, nome_unitrac').eq('ativo', true).is('lat', null)
  console.log('Lojas sem lat/lng:')
  for (const l of data ?? []) console.log(`  ${l.rede_id} | ${l.nome} | cod=${l.codigo_unitrac ?? '—'}`)
}
main()
