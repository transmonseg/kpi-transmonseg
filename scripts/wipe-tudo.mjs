// Limpa TODO o banco de dados de upload/KPI. Preserva apenas:
//   - redes (config)
//   - lojas (master data)
//   - users (auth)
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function count(t) {
  const { count } = await sb.from(t).select('*', { count: 'exact', head: true })
  return count ?? 0
}

async function wipe(t) {
  // delete all rows — usa filtro impossível-de-ser-nulo pra acionar a operação
  const { error } = await sb.from(t).delete().not('id', 'is', null)
  if (error) console.log(`  ✗ ${t}: ${error.message}`)
  else console.log(`  ✓ ${t} limpa`)
}

console.log('\n=== Estado antes ===')
const tables = [
  'anomalias',
  'kpi_rotas',
  'kpis',
  'escala_linhas',
  'escala_uploads',
  'unitrac_paradas',
  'unitrac_uploads',
  'alteracoes',
]
for (const t of tables) {
  try {
    const n = await count(t)
    console.log(`  ${t}: ${n}`)
  } catch {
    console.log(`  ${t}: (não existe ou erro)`)
  }
}

console.log('\n=== Limpando (ordem importa pra FK) ===')
for (const t of tables) await wipe(t)

console.log('\n=== Estado depois ===')
for (const t of tables) {
  try {
    const n = await count(t)
    console.log(`  ${t}: ${n}`)
  } catch {
    console.log(`  ${t}: (não existe)`)
  }
}

console.log('\n✓ Banco zerado. Pode re-uploadar os arquivos pela UI.')
