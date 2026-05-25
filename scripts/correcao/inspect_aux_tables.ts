/**
 * Inspeção de tabelas auxiliares.
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
  for (const tabela of ['rotas_gigantes', 'veiculos_inativos', 'unitrac_rotas_gigantes', 'placas', 'veiculos']) {
    console.log(`\n=== ${tabela} ===`)
    const { data, error } = await supabase.from(tabela).select('*').limit(3)
    if (error) {
      console.log(`  Erro: ${error.message}`)
      continue
    }
    if (!data || data.length === 0) {
      console.log(`  (vazia ou sem permissão)`)
      // tentar inserir um row de teste? não — só pegar contagem
      const { count } = await supabase.from(tabela).select('*', { count: 'exact', head: true })
      console.log(`  count: ${count}`)
      continue
    }
    console.log(`  Keys: ${Object.keys(data[0]).join(', ')}`)
    console.log(`  Sample:`, JSON.stringify(data[0], null, 2))
  }
}
main().catch(e => { console.error(e); process.exit(1) })
