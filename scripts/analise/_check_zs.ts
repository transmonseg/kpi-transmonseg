import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const codes = ['9039007','9039021','9039103','9039104','9039033','9039036','9039048','9039121','9039148']
  for (const c of codes) {
    const { data } = await svc.from('lojas').select('rede_id, nome, codigo_escala, codigo_unitrac, ativo').eq('codigo_unitrac', c)
    console.log(`cod=${c}:`)
    for (const l of data ?? []) console.log(`  [${l.rede_id}] ${l.nome.padEnd(45)} cod_esc=${l.codigo_escala ?? ''} ativo=${l.ativo}`)
  }
  console.log('\nTODAS ZONA_SUL ativas (filtrando duplicatas):')
  const { data } = await svc.from('lojas').select('id, nome, codigo_escala, codigo_unitrac, ativo').eq('rede_id', 'ZONA_SUL').eq('ativo', true).order('nome')
  for (const l of data ?? []) console.log(`  ${l.nome.padEnd(45)} esc=${(l.codigo_escala ?? '').padEnd(6)} uni=${l.codigo_unitrac ?? ''}`)
}
main()
