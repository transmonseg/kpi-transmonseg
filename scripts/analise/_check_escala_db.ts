import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const placas = ['NSM6D98', 'HNG2B61', 'EYL8B91', 'KMY5561', 'KMY-5561']
  for (const p of placas) {
    const { data } = await svc.from('escala_linhas')
      .select('rede_id, loja_nome_raw, loja_codigo_raw, motorista_nome, placa_norm, carro_ordem')
      .eq('data_entrega', '2026-05-19')
      .eq('placa_norm', p.replace('-', ''))
    console.log(`\n${p}:`)
    for (const l of data ?? []) console.log(`  [${l.rede_id}] ${l.loja_nome_raw}  mot=${l.motorista_nome} cod_esc=${l.loja_codigo_raw} carro=${l.carro_ordem}`)
  }
  // Mercado Sto Agostinho FN
  const { data: msa } = await svc.from('escala_linhas')
    .select('rede_id, loja_nome_raw, motorista_nome, placa_norm')
    .eq('data_entrega', '2026-05-19')
    .ilike('loja_nome_raw', '%santo agostinho%')
  console.log('\nMercado Santo Agostinho (escala banco):')
  for (const l of msa ?? []) console.log(`  [${l.rede_id}] ${l.loja_nome_raw}  mot=${l.motorista_nome} placa=${l.placa_norm}`)
}
main()
