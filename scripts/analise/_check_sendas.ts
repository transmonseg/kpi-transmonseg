import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // Lojas com nome relevante
  const queries = [
    'sachinho', 'mundial%erico', 'atlantico', 'barra%tower', 'barramares',
    'sendas%central', 'matriz%cd%duque', 'santo%agostinho', 'petit', 'emporio',
    'americanas', 'armazem%central'
  ]
  for (const q of queries) {
    const { data } = await svc.from('lojas')
      .select('id, rede_id, nome, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, ativo')
      .ilike('nome', `%${q.replace(/%/g, ' ').trim()}%`)
    if (data?.length) {
      console.log(`\n[${q}]`)
      for (const l of data) {
        console.log(`  [${l.rede_id}] ${l.nome.padEnd(40)} cod=${(l.codigo_unitrac ?? '').padEnd(10)} nome_uni=${l.nome_unitrac ?? ''} ativo=${l.ativo}`)
      }
    }
  }
  // Por código
  const codes = ['15247000', '113918', '22144000', '22144002', '22980000', '13156084', '23080000']
  for (const c of codes) {
    const { data } = await svc.from('lojas')
      .select('rede_id, nome, codigo_unitrac, ativo')
      .eq('codigo_unitrac', c)
    console.log(`\ncod=${c}:`)
    for (const l of data ?? []) console.log(`  [${l.rede_id}] ${l.nome} ativo=${l.ativo}`)
  }
}
main()
