import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const DIA = '2026-05-19'
function hhmm(iso: string){ const d=new Date(iso); return String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0') }
;(async () => {
  // escala PRINCESA
  const esc: any[] = []; let o=0
  while(true){ const {data:p}=await sb.from('escala_linhas').select('loja_nome_raw, loja_codigo_raw, placa_norm').eq('data_entrega',DIA).eq('rede_id','PRINCESA').range(o,o+999); if(!p||!p.length)break; esc.push(...p); if(p.length<1000)break; o+=1000 }
  // paradas de todas as placas princesa
  const placas = [...new Set(esc.map(e=>e.placa_norm).filter(Boolean))]
  const par: any[] = []; o=0
  while(true){ const {data:p}=await sb.from('unitrac_paradas').select('placa_norm,codigo_loja,nome_loja,classificacao,chegada,saida,duracao_seg,unitrac_uploads!inner(data_relatorio)').eq('unitrac_uploads.data_relatorio',DIA).in('placa_norm',placas).range(o,o+999); if(!p||!p.length)break; par.push(...p); if(p.length<1000)break; o+=1000 }
  const byPlaca = new Map<string,any[]>()
  for(const p of par){ const a=byPlaca.get(p.placa_norm)??[]; a.push(p); byPlaca.set(p.placa_norm,a) }

  for(const e of esc){
    console.log(`\n■ ${e.loja_nome_raw}  [escCod=${e.loja_codigo_raw}]  placa=${e.placa_norm}`)
    const ps=(byPlaca.get(e.placa_norm)??[]).filter(p=>p.classificacao==='LOJA'&&p.codigo_loja)
      .sort((a,b)=>new Date(a.chegada).getTime()-new Date(b.chegada).getTime())
    if(!ps.length){ console.log('   (sem parada LOJA)'); continue }
    for(const p of ps) console.log(`   ${hhmm(p.chegada)}-${p.saida?hhmm(p.saida):'??'} cod=${p.codigo_loja} ${(p.nome_loja??'').slice(0,40)}`)
  }
})()
