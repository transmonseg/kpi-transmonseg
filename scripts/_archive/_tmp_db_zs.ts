import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

;(async () => {
  // Lojas ZS com data_entrega=20/05 no DB
  const { data: d20 } = await sb.from('escala_linhas')
    .select('id, data, data_entrega, loja_nome_raw, placa_norm')
    .eq('rede_id', 'ZONA_SUL')
    .eq('data_entrega', '2026-05-20')
    .order('data')
  console.log(`\n=== ZS data_entrega=20/05 no DB: ${d20?.length ?? 0} linhas ===`)
  for (const l of d20 ?? []) {
    console.log(`  data=${l.data}  loja=${l.loja_nome_raw?.slice(0,30).padEnd(30)}  placa=${l.placa_norm}`)
  }

  // Lojas ZS com data=20/05 e data_entrega=21/05
  const { data: d21 } = await sb.from('escala_linhas')
    .select('id, data, data_entrega, loja_nome_raw, placa_norm')
    .eq('rede_id', 'ZONA_SUL')
    .eq('data', '2026-05-20')
    .eq('data_entrega', '2026-05-21')
    .order('loja_nome_raw')
  console.log(`\n=== ZS data=20/05 data_entrega=21/05 no DB: ${d21?.length ?? 0} linhas ===`)
  for (const l of d21 ?? []) {
    console.log(`  loja=${l.loja_nome_raw?.slice(0,35).padEnd(35)}  placa=${l.placa_norm}`)
  }

  // Ver datas distintas de upload ZS
  const { data: datas } = await sb.from('escala_linhas')
    .select('data, data_entrega')
    .eq('rede_id', 'ZONA_SUL')
    .gte('data', '2026-05-18')
    .lte('data', '2026-05-22')
    .order('data')
  const uniq = [...new Set((datas ?? []).map(d => `${d.data} → ${d.data_entrega}`))]
  console.log('\n=== ZS datas no DB (18-22 maio) ===')
  uniq.forEach(u => console.log(' ', u))
})()
