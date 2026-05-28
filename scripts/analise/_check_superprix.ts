import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await svc.from('lojas').select('rede_id, nome, codigo_escala, codigo_unitrac, ativo').eq('rede_id', 'SUPERPRIX').order('nome')
  for (const l of data ?? []) console.log(`  ${l.nome.padEnd(45)} esc=${(l.codigo_escala??'').padEnd(6)} uni=${(l.codigo_unitrac??'').padEnd(10)} ativo=${l.ativo}`)
}
main()
