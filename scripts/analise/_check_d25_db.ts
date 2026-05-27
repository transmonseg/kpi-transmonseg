import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Total geral dia 25
  const { count: totD25 } = await svc.from('escala_linhas').select('*', { count: 'exact', head: true }).eq('data_entrega', '2026-05-25')
  console.log(`Total escala_linhas dia 25: ${totD25}`)

  // Por rede
  const { data: porRede } = await svc.from('escala_linhas').select('rede_id').eq('data_entrega', '2026-05-25')
  const counts: Record<string, number> = {}
  porRede?.forEach(r => { counts[r.rede_id] = (counts[r.rede_id] || 0) + 1 })
  console.log('\nPor rede dia 25:')
  Object.entries(counts).sort((a,b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`))

  // Comparativo dia 19 (que sabemos ter dados)
  const { count: totD19 } = await svc.from('escala_linhas').select('*', { count: 'exact', head: true }).eq('data_entrega', '2026-05-19')
  console.log(`\nTotal escala_linhas dia 19 (comparativo): ${totD19}`)

  // Origem do MARCOS FERNANDO — quem é
  const { data: marcos } = await svc.from('escala_linhas').select('motorista_nome, motorista_codigo, placa_norm, rede_id, loja_nome_raw, data_entrega').ilike('motorista_nome', 'MARCOS%FERNANDO%').gte('data_entrega', '2026-05-15').order('data_entrega', { ascending: false }).limit(15)
  console.log(`\nMARCOS FERNANDO no banco:`)
  marcos?.forEach(l => console.log(`  ${l.data_entrega} ${l.rede_id} ${l.loja_nome_raw}: cod=${l.motorista_codigo} placa=${l.placa_norm}`))
}
main().catch(e => { console.error(e); process.exit(1) })
