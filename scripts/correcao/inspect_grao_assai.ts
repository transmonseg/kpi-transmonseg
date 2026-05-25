import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
async function main() {
  console.log('=== Lojas ARMAZEM_GRAO no cadastro ===')
  const { data: ag } = await supabase
    .from('lojas')
    .select('id, nome, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('rede_id', 'ARMAZEM_GRAO')
    .eq('ativo', true)
    .order('nome')
  for (const l of ag ?? []) console.log(`  ${l.codigo_unitrac ?? '—       '} | ${l.nome} | lat=${l.lat?.toFixed?.(4) ?? '—'}`)

  console.log('\n=== Lojas SENDAS com Loja 338 ou 340 ou Santa Cruz 2 ou Taquara ===')
  const { data: sn } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, codigo_unitrac, nome_unitrac, lat, lng')
    .eq('ativo', true)
    .or('nome.ilike.%338%,nome.ilike.%340%,nome.ilike.%santa cruz%,nome.ilike.%taquara%,nome.ilike.%nova iguacu ii%,nome.ilike.%nova iguaçu ii%')
  for (const l of sn ?? []) console.log(`  [${l.rede_id}] ${l.codigo_unitrac ?? '—'} | ${l.nome} | lat=${l.lat?.toFixed?.(4) ?? '—'}`)

  console.log('\n=== Lojas ZONA_SUL com codigo_escala 10, 28, 29, 44 ===')
  const { data: zs } = await supabase
    .from('lojas')
    .select('id, nome, codigo_escala, codigo_unitrac, lat, lng')
    .eq('rede_id', 'ZONA_SUL')
    .eq('ativo', true)
    .order('codigo_escala')
  for (const l of zs ?? []) console.log(`  cod_esc=${l.codigo_escala ?? '—'} | cod_uni=${l.codigo_unitrac ?? '—'} | ${l.nome} | lat=${l.lat?.toFixed?.(4) ?? '—'}`)
}
main()
