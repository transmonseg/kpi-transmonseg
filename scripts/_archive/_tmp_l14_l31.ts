import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

;(async () => {
  // Loja 14 e Loja 31 ZS no cadastro
  const { data } = await sb.from('lojas').select('id, nome, lat, lng, raio_metros, codigo_escala, codigo_unitrac, nome_unitrac, ativo').eq('rede_id', 'ZONA_SUL').order('nome')
  console.log('Cadastro ZS — lojas 14/31:')
  for (const l of data ?? []) {
    if (!/(14|31)/.test(l.nome)) continue
    console.log(`  ${l.nome.padEnd(40)} lat=${l.lat} lng=${l.lng} raio=${l.raio_metros} cod_e=${l.codigo_escala} cod_u=${l.codigo_unitrac} nome_u=${l.nome_unitrac} ativo=${l.ativo}`)
  }

  // Escala dia 19
  const { data: esc } = await sb.from('escala_linhas')
    .select('placa_norm, loja_nome_raw, loja_codigo_raw, data_entrega')
    .eq('rede_id', 'ZONA_SUL').eq('data_entrega', '2026-05-19')
  console.log('\nEscala dia 19 — Lojas 14 e 31:')
  for (const e of esc ?? []) {
    if (!/14|31/.test(e.loja_nome_raw || '')) continue
    if (/1129|1\d{2,}/.test(e.loja_nome_raw || '')) continue
    console.log(`  ${e.loja_nome_raw}  placa=${e.placa_norm}  cod=${e.loja_codigo_raw}`)
  }
})()
