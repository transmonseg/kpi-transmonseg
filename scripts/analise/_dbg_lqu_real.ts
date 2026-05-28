import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { cruzaEscalaUnitrac, setSemGeo } from '@/lib/kpi/matcher'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
;(async () => {
  setSemGeo(true)
  const DIA = '2026-05-19'
  const { data: esc } = await sb.from('escala_linhas').select('id,rede_id,placa_norm,loja_nome_raw,loja_codigo_raw,motorista_nome,carro_ordem,data_entrega').eq('data_entrega',DIA).eq('rede_id','ZONA_SUL')
  const par: any[] = []; let o=0
  while(true){const{data}=await sb.from('unitrac_paradas').select('id,placa_norm,chegada,saida,duracao_seg,lat,lng,local_parada,codigo_loja,nome_loja,classificacao,loja_id,ordem,unitrac_uploads!inner(data_relatorio)').eq('unitrac_uploads.data_relatorio',DIA).order('chegada').range(o,o+999);if(!data?.length)break;par.push(...data);if(data.length<1000)break;o+=1000}
  const { data: lojas } = await sb.from('lojas').select('id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros').eq('ativo',true).eq('rede_id','ZONA_SUL')
  const lr = (esc??[]) // TODA a rede ZS (igual o gerador real)
  const placas = new Set(lr.map(l=>l.placa_norm))
  const pr = par.filter(p=>placas.has(p.placa_norm))
  console.log('Linhas escala LQU5546:', lr.map(l=>`${l.loja_codigo_raw}:${l.loja_nome_raw}`).join(' | '))
  console.log('Cadastro ZS loja 15/27/28/29:', (lojas??[]).filter(l=>['15','27','28','29'].includes(l.codigo_escala as string)).map(l=>`esc=${l.codigo_escala} uni=${l.codigo_unitrac}`).join(' | '))
  const rotas = await cruzaEscalaUnitrac(lr as any, pr as any, lojas as any)
  for (const r of rotas as any[]) {
    const e = lr.find(x=>x.id===r.escala_linha_id)
    if (e?.placa_norm !== 'LQU5546') continue
    console.log(`\n${e?.loja_codigo_raw} ${e?.loja_nome_raw}: ${r.paradas.length} paradas, status=${r.status}`)
    for (const p of r.paradas) console.log('   ', new Date(p.chegada).toISOString().slice(11,16), 'cod='+(p.codigo_loja??'?'), (p.nome??'').slice(0,30))
  }
})()
