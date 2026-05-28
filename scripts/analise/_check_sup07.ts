import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const codes = ['3030007', '3030013', '3030014', '3030008', '3030004', '3030201', '3030011', '3030113']
  for (const c of codes) {
    const { data } = await svc.from('lojas').select('rede_id, nome, codigo_unitrac, lat, lng, raio_metros, ativo').eq('codigo_unitrac', c)
    console.log(`cod=${c}:`)
    for (const l of data ?? []) console.log(`  [${l.rede_id}] ${l.nome.padEnd(45)} lat=${l.lat} lng=${l.lng} raio=${l.raio_metros} ativo=${l.ativo}`)
  }
}
main()
