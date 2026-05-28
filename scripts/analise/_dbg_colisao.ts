import { config } from 'dotenv'; config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
const BASE='C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
;(async()=>{
  // dia 18 Loja 11 Leblon: placas INW8A51 e KRH5H67
  const veic=await parseUnitracPdf(readFileSync(`${BASE}/ESCALA DIA 18/relatorio_9401.pdf`),null)
  for(const placa of ['INW8A51','KRH5H67']){
    const v=veic.find(x=>x.placa_norm===placa)
    console.log('\n'+placa+':',v?'':'(NAO ENCONTRADA no Unitrac)')
    if(v) for(const p of v.paradas.filter((p:any)=>p.classificacao==='LOJA'&&p.codigo_loja)) console.log('  '+new Date(p.chegada).toISOString().slice(11,16)+'-'+(p.saida?new Date(p.saida).toISOString().slice(11,16):'?'),'cod='+p.codigo_loja,(p.nome_loja||'').slice(0,28))
  }
})()
