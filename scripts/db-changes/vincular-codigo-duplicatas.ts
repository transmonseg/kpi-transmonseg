/**
 * Dedupe de cadastro: para cada loja ATIVA com codigo_unitrac=NULL, se existe um
 * gêmeo coded (mesma rede, ≤100m E nome compatível — mesmo número de loja OU token
 * forte compartilhado), COPIA o codigo_unitrac (+nome_unitrac). Mesmo lugar+nome =
 * mesma loja → seguro. O guard de NOME evita casar lojas diferentes coladas (mall).
 *   npx tsx scripts/db-changes/vincular-codigo-duplicatas.ts [--apply]
 */
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const APPLY = process.argv.includes('--apply')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
function hav(a:number,b:number,c:number,d:number){const R=6371000,t=Math.PI/180;const u=(c-a)*t,v=(d-b)*t;const x=Math.sin(u/2)**2+Math.cos(a*t)*Math.cos(c*t)*Math.sin(v/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
const norm=(s:string)=>(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim()
const STOP=new Set(['LOJA','FILIAL','LJ','CARRO','REDE','ENTREGA','SUPER','PRIX','SUPERPRIX','PREZUNIC','CARREFOUR','PRINCESA','ASSAI','SENDAS','GUANABARA','ATACADAO','ZONA','SUL','ARMAZEM','GRAO','DO','DA','DE','EMANUEL','PAX','FEIRA','NOVA','MEGA','BOX','PETIT','EMPORIO','COMERCIO'])
const numLoja=(s:string)=>{const m=norm(s).match(/\b(\d{1,3})\b/);return m?m[1]:null}
const tokens=(s:string)=>new Set(norm(s).split(' ').filter(t=>t.length>=4&&!STOP.has(t)&&!/^\d+$/.test(t)))
function nomeBate(a:string,b:string):boolean{
 const na=numLoja(a),nb=numLoja(b); if(na&&nb)return na===nb // ambos têm número → exige igual
 const ta=tokens(a),tb=tokens(b); for(const t of ta)if(tb.has(t))return true; return false // senão, token forte comum
}
async function main(){
 console.log(`\n=== VINCULAR CÓDIGO (guard nome) (${APPLY?'APPLY':'DRY-RUN'}) ===`)
 const lojas:any[]=[];for(let o=0;;o+=1000){const{data}=await sb.from('lojas').select('id,rede_id,nome,codigo_unitrac,nome_unitrac,lat,lng').eq('ativo',true).order('id').range(o,o+999);if(!data?.length)break;lojas.push(...data);if(data.length<1000)break}
 const coded=lojas.filter(l=>l.codigo_unitrac&&l.lat!=null)
 const ups:{id:string,nome:string,cod:string,nu:string|null}[]=[]; const rej:string[]=[]
 for(const l of lojas.filter(l=>!l.codigo_unitrac&&l.lat!=null)){
   const gemeos=coded.filter(c=>c.rede_id===l.rede_id&&hav(l.lat!,l.lng!,c.lat!,c.lng!)<=100&&nomeBate(l.nome,c.nome))
   const cods=new Set(gemeos.map(g=>g.codigo_unitrac)); if(cods.size!==1){if(gemeos.length===0){const near=coded.filter(c=>c.rede_id===l.rede_id&&hav(l.lat!,l.lng!,c.lat!,c.lng!)<=100);if(near.length)rej.push(`REJEIT (nome ≠) ${l.nome} ~ ${near[0].nome}`)}continue}
   const g=gemeos[0]; console.log(`  ${l.nome}  ←${g.codigo_unitrac} "${g.nome}" (${Math.round(hav(l.lat!,l.lng!,g.lat!,g.lng!))}m)`)
   ups.push({id:l.id,nome:l.nome,cod:g.codigo_unitrac!,nu:g.nome_unitrac})
 }
 console.log(`\nREJEITADOS pelo guard de nome: ${rej.length}`); rej.slice(0,8).forEach(r=>console.log('  '+r))
 console.log(`\n${ups.length} a vincular.`)
 if(!APPLY){console.log('(dry-run)');return}
 for(const u of ups){const{error}=await sb.from('lojas').update({codigo_unitrac:u.cod,nome_unitrac:u.nu}).eq('id',u.id);if(error){console.error('ERRO',u.nome,error.message);process.exit(1)}console.log('vinculado',u.nome)}
}
main().catch(e=>{console.error(e);process.exit(1)})
