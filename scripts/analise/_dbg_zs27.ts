import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
;(async () => {
  // Quem estava escalado pra loja 27 ZS dia 19?
  const { data: esc } = await sb.from('escala_linhas').select('placa_norm,loja_nome_raw,loja_codigo_raw,motorista_nome,carro_ordem').eq('data_entrega','2026-05-19').eq('rede_id','ZONA_SUL').ilike('loja_nome_raw','%27%')
  console.log('Escala ZS lojas 27:')
  for(const e of esc||[]) console.log('  placa='+e.placa_norm, 'loja='+e.loja_nome_raw, 'cod='+e.loja_codigo_raw, 'carro='+e.carro_ordem, 'motor='+e.motorista_nome)

  // O que o Unitrac tem pra essas placas?
  const placas = [...new Set((esc||[]).map(e=>e.placa_norm).filter(Boolean))]
  for(const placa of placas.slice(0,3)) {
    const { data: par } = await sb.from('unitrac_paradas').select('codigo_loja,nome_loja,chegada,saida,classificacao,unitrac_uploads!inner(data_relatorio)').eq('placa_norm',placa).eq('unitrac_uploads.data_relatorio','2026-05-19').eq('classificacao','LOJA').order('chegada')
    console.log('\n'+placa+' paradas LOJA:')
    for(const p of par||[]) console.log('  '+(p.chegada as string).slice(11,16)+'-'+(p.saida?(p.saida as string).slice(11,16):'?'), 'cod='+p.codigo_loja, (p.nome_loja||'').slice(0,30))
  }
})()
