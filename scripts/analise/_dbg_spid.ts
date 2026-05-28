import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
;(async () => {
  // Escalas PREZUNIC SPID dia 19
  const { data: esc } = await sb.from('escala_linhas').select('loja_nome_raw,loja_codigo_raw,placa_norm,motorista_nome').eq('data_entrega','2026-05-19').eq('rede_id','PREZUNIC').ilike('loja_nome_raw','%SPID%')
  console.log('ESCALAS PREZUNIC SPID:')
  const placas=new Set<string>()
  for(const e of esc||[]) { console.log('  '+e.placa_norm?.padEnd(12), e.loja_nome_raw, 'cod='+e.loja_codigo_raw); if(e.placa_norm) placas.add(e.placa_norm) }
  for(const placa of placas) {
    const { data } = await sb.from('unitrac_paradas').select('codigo_loja,nome_loja,chegada,saida,classificacao,unitrac_uploads!inner(data_relatorio)').eq('placa_norm',placa).eq('unitrac_uploads.data_relatorio','2026-05-19').eq('classificacao','LOJA').order('chegada')
    console.log('\n'+placa+':')
    for(const p of data||[]) console.log('  '+(p.chegada as string).slice(11,16)+'-'+(p.saida?(p.saida as string).slice(11,16):'?'), 'cod='+p.codigo_loja, (p.nome_loja||'').slice(0,30))
  }
})()
