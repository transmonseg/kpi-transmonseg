import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
;(async () => {
  const { data } = await sb.from('unitrac_paradas').select('codigo_loja,nome_loja,chegada,saida,classificacao,unitrac_uploads!inner(data_relatorio)').eq('placa_norm','LQU5546').eq('unitrac_uploads.data_relatorio','2026-05-19').eq('classificacao','LOJA').order('chegada')
  console.log('LQU5546 paradas LOJA dia 19:')
  for(const p of data||[]) console.log('  '+(p.chegada as string).slice(11,16)+'-'+(p.saida?(p.saida as string).slice(11,16):'?'), 'cod='+p.codigo_loja, (p.nome_loja||'').slice(0,38))
  const { data: e } = await sb.from('escala_linhas').select('loja_nome_raw,loja_codigo_raw,carro_ordem').eq('placa_norm','LQU5546').eq('data_entrega','2026-05-19').eq('rede_id','ZONA_SUL')
  console.log('\nESCALA ZS LQU5546:')
  for(const x of e||[]) console.log('  ['+x.loja_codigo_raw+'] '+x.loja_nome_raw+' carro='+x.carro_ordem)
  const { data: lj } = await sb.from('lojas').select('codigo_escala,codigo_unitrac,nome').eq('rede_id','ZONA_SUL').in('codigo_escala',['15','27','28','29','20','05'])
  console.log('\nCADASTRO ZS (escala 15/27/28/29/20/05):')
  for(const l of lj||[]) console.log('  esc='+l.codigo_escala+' uni='+l.codigo_unitrac+' '+l.nome)
})()
