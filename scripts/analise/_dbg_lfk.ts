import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
;(async () => {
  const { data } = await sb.from('unitrac_paradas').select('codigo_loja,nome_loja,chegada,saida,classificacao,unitrac_uploads!inner(data_relatorio)').eq('placa_norm','LFK2C56').eq('unitrac_uploads.data_relatorio','2026-05-19').eq('classificacao','LOJA').order('chegada')
  for(const p of data||[]) console.log((p.chegada as string).slice(11,16)+'-'+(p.saida?(p.saida as string).slice(11,16):'?'), 'cod='+p.codigo_loja, (p.nome_loja||'').slice(0,30))
})()
