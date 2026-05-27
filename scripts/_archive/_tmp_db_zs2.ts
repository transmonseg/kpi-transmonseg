import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

;(async () => {
  // ZS linhas data_entrega=20/05
  const { data: d20, error: e1 } = await sb.from('escala_linhas')
    .select('id, data_entrega, loja_nome_raw, loja_codigo_raw, placa_norm')
    .eq('rede_id', 'ZONA_SUL')
    .eq('data_entrega', '2026-05-20')
    .order('loja_nome_raw')
  if (e1) console.error('e1:', e1.message)
  console.log(`\n=== ZS data_entrega=20/05: ${d20?.length ?? 0} linhas ===`)
  for (const l of d20 ?? []) {
    console.log(`  loja=${l.loja_nome_raw?.slice(0,35).padEnd(35)}  cod=${l.loja_codigo_raw?.padEnd(5)}  placa=${l.placa_norm}`)
  }

  // ZS linhas data_entrega=21/05
  const { data: d21, error: e2 } = await sb.from('escala_linhas')
    .select('id, data_entrega, loja_nome_raw, loja_codigo_raw, placa_norm')
    .eq('rede_id', 'ZONA_SUL')
    .eq('data_entrega', '2026-05-21')
    .order('loja_nome_raw')
  if (e2) console.error('e2:', e2.message)
  console.log(`\n=== ZS data_entrega=21/05: ${d21?.length ?? 0} linhas ===`)
  for (const l of d21 ?? []) {
    console.log(`  loja=${l.loja_nome_raw?.slice(0,35).padEnd(35)}  cod=${l.loja_codigo_raw?.padEnd(5)}  placa=${l.placa_norm}`)
  }
})()
