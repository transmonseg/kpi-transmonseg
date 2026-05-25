/**
 * Aplica a migration 20260524000000_rotas_gigantes_e_veiculos_inativos.sql.
 * Usa pg direto via connection string (não Supabase client porque DDL).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // Como Supabase JS não suporta DDL direta, usa rpc 'exec' se disponível,
  // ou cria as tabelas com inserts subsequentes que falham → assume erro.
  // Aproach: tenta inserir; se tabela não existe, escrevo a SQL pro user aplicar.
  const sql = readFileSync('supabase/migrations/20260524000000_rotas_gigantes_e_veiculos_inativos.sql', 'utf8')

  console.log('Tentando aplicar via RPC exec...')
  // @ts-expect-error rpc exec é função custom que pode não existir
  const { data, error } = await supabase.rpc('exec', { sql })
  if (error) {
    console.error('RPC exec não disponível:', error.message)
    console.log('\nSQL a aplicar manualmente:')
    console.log(sql)
    console.log('\nOu via psql:')
    console.log('  psql $SUPABASE_DB_URL -f supabase/migrations/20260524000000_rotas_gigantes_e_veiculos_inativos.sql')
    process.exit(1)
  }
  console.log('✓ Migration aplicada:', data)
}
main().catch(e => { console.error(e); process.exit(1) })
