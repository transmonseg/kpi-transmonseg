/**
 * Corrige coords de lojas-duplicata (uni=null, usadas pela escala) que estão com
 * coordenada ERRADA, copiando do "gêmeo" cadastrado com código+coord certa.
 * Mesma classe do corrigir-coords-assai. NÃO toca código/nome/ativo. Dry-run padrão.
 *   npx tsx scripts/db-changes/corrigir-coords-duplicatas.ts [--apply]
 */
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const APPLY = process.argv.includes('--apply')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
// pares (rede, nome-da-duplicata ilike, lat/lng corretos do gêmeo)
const FIX = [
  { rede:'PRINCESA', match:/arraial 2 \(2/i, lat:-22.967605, lng:-42.02415, ref:'ARRAIAL DO CABO 2' },
  { rede:'PRINCESA', match:/arraial 3 \(3/i, lat:-22.97262, lng:-42.02849, ref:'ARRAIAL DO CABO 3' },
]
function hav(a:number,b:number,c:number,d:number){const R=6371000,t=Math.PI/180;const u=(c-a)*t,v=(d-b)*t;const x=Math.sin(u/2)**2+Math.cos(a*t)*Math.cos(c*t)*Math.sin(v/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
async function main(){
 console.log(`\n=== CORRIGIR COORDS DUPLICATAS (${APPLY?'APPLY':'DRY-RUN'}) ===`)
 const {data}=await sb.from('lojas').select('id,rede_id,nome,codigo_unitrac,lat,lng,ativo').is('codigo_unitrac',null).eq('ativo',true)
 const ups:{id:string,nome:string,lat:number,lng:number}[]=[]
 for(const f of FIX){ for(const l of (data??[]).filter(l=>l.rede_id===f.rede&&f.match.test(l.nome))){
   const d=l.lat!=null?Math.round(hav(l.lat,l.lng!,f.lat,f.lng)):Infinity
   console.log(`  ${l.nome}: atual ${l.lat},${l.lng} dist=${Number.isFinite(d)?d+'m':'s/coord'} → ${f.lat},${f.lng} (ref ${f.ref})`)
   if(d>1000) ups.push({id:l.id,nome:l.nome,lat:f.lat,lng:f.lng})
 }}
 console.log(`\n${ups.length} a corrigir.`)
 if(!APPLY){console.log('(dry-run)');return}
 for(const u of ups){const{error}=await sb.from('lojas').update({lat:u.lat,lng:u.lng}).eq('id',u.id);if(error){console.error('ERRO',u.nome,error.message);process.exit(1)}console.log('gravado',u.nome)}
}
main().catch(e=>{console.error(e);process.exit(1)})
