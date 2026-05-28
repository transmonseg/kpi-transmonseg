/**
 * Debug: por que inferirSaiDaEscala falhou pra Loja 133 ASSAI e Carrefour CG dia 19?
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  console.log('=== ASSAI Loja 133 (Barra I) — historico 14 dias antes do dia 19 ===')
  const { data: d1 } = await svc.from('escala_linhas')
    .select('motorista_nome, motorista_codigo, placa_norm, loja_nome_raw, loja_codigo_raw, data_entrega')
    .eq('rede_id', 'ASSAI')
    .gte('data_entrega', '2026-05-05')
    .lte('data_entrega', '2026-05-19')
    .or('loja_codigo_raw.eq.133,loja_nome_raw.ilike.%barra i%,loja_nome_raw.ilike.%senna%')
    .order('data_entrega', { ascending: false })
    .limit(15)
  d1?.forEach(l => console.log(`  ${l.data_entrega} | loja_codigo_raw='${l.loja_codigo_raw}' | ${l.loja_nome_raw} | ${l.motorista_nome}/${l.placa_norm}`))

  console.log('\n=== CARREFOUR Campo Grande — historico 14 dias ===')
  const { data: d2 } = await svc.from('escala_linhas')
    .select('motorista_nome, motorista_codigo, placa_norm, loja_nome_raw, loja_codigo_raw, data_entrega')
    .eq('rede_id', 'CARREFOUR')
    .gte('data_entrega', '2026-05-05')
    .lte('data_entrega', '2026-05-19')
    .ilike('loja_nome_raw', '%campo grande%')
    .order('data_entrega', { ascending: false })
    .limit(15)
  d2?.forEach(l => console.log(`  ${l.data_entrega} | loja_codigo_raw='${l.loja_codigo_raw}' | ${l.loja_nome_raw} | ${l.motorista_nome}/${l.placa_norm}`))

  console.log('\n=== TODAS CARREFOUR dia 19 ===')
  const { data: d3 } = await svc.from('escala_linhas')
    .select('motorista_nome, placa_norm, loja_nome_raw, loja_codigo_raw')
    .eq('rede_id', 'CARREFOUR')
    .eq('data_entrega', '2026-05-19')
  d3?.forEach(l => console.log(`  loja_codigo_raw='${l.loja_codigo_raw}' | ${l.loja_nome_raw} | ${l.motorista_nome}/${l.placa_norm}`))
}
main().catch(e => { console.error(e); process.exit(1) })
