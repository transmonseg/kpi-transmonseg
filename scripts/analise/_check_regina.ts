import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
const { data: regina } = await svc.from('lojas')
  .select('id, rede_id, nome, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, ativo')
  .eq('rede_id', 'ARMAZEM_GRAO')
  .order('nome')

console.log('Lojas ARMAZEM_GRAO:')
for (const l of regina ?? []) {
  console.log(`  ${l.nome.padEnd(45)} cod_esc=${(l.codigo_escala ?? '').padEnd(10)} cod_uni=${(l.codigo_unitrac ?? '').padEnd(10)} lat=${l.lat} lng=${l.lng} raio=${l.raio_metros}m ativo=${l.ativo}`)
}

console.log('\nCAB Petrópolis e Mercado Santo Agostinho:')
const { data: cab } = await svc.from('lojas')
  .select('id, rede_id, nome, codigo_unitrac, lat, lng')
  .or('codigo_unitrac.eq.7012010,codigo_unitrac.eq.23080000,nome.ilike.%CAB%,nome.ilike.%SANTO AGOSTINHO%,nome.ilike.%COSMOS%,nome.ilike.%PETIT%,nome.ilike.%EMPORIO%')
for (const l of cab ?? []) {
  console.log(`  [${l.rede_id}] ${l.nome.padEnd(45)} cod_uni=${l.codigo_unitrac ?? ''}`)
}
}
main()
