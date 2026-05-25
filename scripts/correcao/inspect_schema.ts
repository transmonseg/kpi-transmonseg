/**
 * Inspeção rápida do schema atual de lojas + redes pra basear a Sprint A.
 * Uso: npx tsx scripts/correcao/inspect_schema.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  const { data: lojas, error } = await supabase
    .from('lojas')
    .select('*')
    .limit(3)
  if (error) { console.error(error); return }
  console.log('Sample loja keys:', lojas?.[0] ? Object.keys(lojas[0]) : 'no rows')
  console.log('Sample loja 0:', JSON.stringify(lojas?.[0], null, 2))

  const { data: redes } = await supabase.from('redes').select('*').limit(50)
  console.log('\nRedes (sample 1):', redes?.[0] ? Object.keys(redes[0]) : 'no rows')
  console.log('\nRedes list:')
  for (const r of redes ?? []) console.log(`  ${r.id} | ${r.nome}`)

  const { count: totalLojas } = await supabase.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true)
  console.log(`\nTotal lojas ativas: ${totalLojas}`)
  const { count: semCodigo } = await supabase.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true).is('codigo_unitrac', null)
  console.log(`  Sem codigo_unitrac: ${semCodigo}`)
  const { count: semNome } = await supabase.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true).is('nome_unitrac', null)
  console.log(`  Sem nome_unitrac: ${semNome}`)
  const { count: semLat } = await supabase.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true).is('lat', null)
  console.log(`  Sem lat: ${semLat}`)

  // listar tabelas relacionadas que existem
  console.log('\n=== Verificar tabelas auxiliares ===')
  for (const tabela of ['veiculos', 'rotas_gigantes', 'veiculos_inativos', 'unitrac_rotas_gigantes', 'placas']) {
    const { error: errT, count } = await supabase.from(tabela).select('*', { count: 'exact', head: true })
    if (errT) console.log(`  ${tabela}: NÃO EXISTE (${errT.message.slice(0, 80)})`)
    else console.log(`  ${tabela}: existe, ${count} rows`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
