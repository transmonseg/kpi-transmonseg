/**
 * AUDITORIA COMPLETA — gerado (sem geo) × manual, dia 19, loja por loja.
 * 5 categorias por loja:
 *   ACERTO         — ambos preenchem e batem (tol 10min) OU ambos vazios/não-foi
 *   ERRO_HORARIO   — ambos preenchem mas horários divergem
 *   SISTEMA_INVENTOU (falso +) — sistema preencheu, manual vazio/NÃO FOI
 *   SISTEMA_NAO_ACHOU (falso -)— sistema vazio, manual tem horário
 *   SO_UM_LADO     — loja só existe num dos arquivos
 *
 * Pros SISTEMA_NAO_ACHOU, vai no Unitrac ver se a placa TINHA parada LOJA com
 * código limpo (→ bug do matcher) ou não (→ dado ausente/bugado, esperado vazio).
 */
import { config } from 'dotenv'; config({ path: '.env.local' })
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const MANUAL_DIR = 'C:/Users/media/Downloads/KPI SMANUAIS'
const BETA_DIR = 'docs/conversas-tia-erica/kpi-beta'
const DIA = '2026-05-19'
const TOL = 10
const BASE_LAT = -22.828, BASE_LNG = -43.339

const PARES: Array<[string, string]> = [
  ['ARMAZEM_GRAO', 'KPI ARMAZEM DO GRAO (2).xlsx'], ['ASSAI', 'KPI ASSAI (4).xlsx'],
  ['ATACADAO', 'KPI ATACADAO (4).xlsx'], ['CARREFOUR', 'KPI CARREFOUR (4).xlsx'],
  ['GUANABARA', 'KPI GUANABARA (4).xlsx'], ['PREZUNIC', 'KPI PREZUNIC (6).xlsx'],
  ['PRINCESA', 'KPI PRINCESA (11).xlsx'], ['SUPER_PAX', 'KPI SUPERPAX.xlsx'],
  ['SUPERPRIX', 'KPI SUPERPRIX (4).xlsx'], ['ZONA_SUL', 'KPI ZONA SUL.xlsx'],
]

function haversine(a:number,b:number,c:number,d:number){const R=6371000,f1=a*Math.PI/180,f2=c*Math.PI/180,df=(c-a)*Math.PI/180,dl=(d-b)*Math.PI/180,x=Math.sin(df/2)**2+Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function norm(s:string){let x=s.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/FILIAL/g,'F').replace(/\bLOJA\b/g,'').replace(/[^A-Z0-9]+/g,' ').trim();x=x.replace(/^(PAX|GB|ASSAI|SENDAS|PREZUNIC|CARREFOUR|PRINCESA|SUPERPRIX|ATACADAO|GUANABARA|VIANENSE|SAM ?S|MUNDIAL|ZONA SUL)\s+/,'');x=x.replace(/\s*\d*\s*CARRO.*$/,'').trim();return x}
function ct(v:any):string{if(v==null)return'';if(v instanceof Date)return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`;if(typeof v==='object'){if(v.text)return v.text;if(v.result!=null)return ct(v.result);if(v.richText)return v.richText.map((r:any)=>r.text).join('');return''}return String(v).trim()}
function toMin(s:string){const m=s.match(/(\d{1,2}):(\d{2})/);return m?+m[1]*60+ +m[2]:null}
type Cols={cd:number;chd:number;sai:number;ini:number;fim:number}
function acharCols(ws:ExcelJS.Worksheet,hr:number):Cols{let cd=-1,chd=-1,sai=-1;const row=ws.getRow(hr);for(let c=1;c<=ws.columnCount;c++){const t=ct(row.getCell(c).value).toUpperCase().replace(/\s+/g,' ');if(/SAIDA CD/.test(t)&&cd<0)cd=c;else if(/CH?D LOJA|CHEGAD/.test(t)&&chd<0)chd=c;else if(/SAIDA LOJA/.test(t)&&sai<0)sai=c}if(cd<0)cd=5;if(chd<0)chd=6;if(sai<0)sai=7;return{cd,chd,sai,ini:Math.min(cd,chd,sai),fim:Math.max(cd,chd,sai)+1}}
type Est={tipo:'horario'|'vazio'|'naofoi';chd:number|null;sai:number|null}
function estado(row:ExcelJS.Row,c:Cols):Est{const tt:string[]=[];for(let i=c.ini;i<=c.fim;i++)tt.push(ct(row.getCell(i).value).toUpperCase());const j=tt.join(' ');if(/N[ÃA]O\s*FOI/.test(j))return{tipo:'naofoi',chd:null,sai:null};const chd=toMin(ct(row.getCell(c.chd).value)),sai=toMin(ct(row.getCell(c.sai).value)),cd=toMin(ct(row.getCell(c.cd).value));if(/SEM\s*RASTREAD/.test(j))return{tipo:'vazio',chd:null,sai:null};if(chd==null&&sai==null&&cd==null)return{tipo:'vazio',chd:null,sai:null};return{tipo:'horario',chd,sai}}
function lerLojas(ws:ExcelJS.Worksheet){const m=new Map<string,Est>();let hr=-1;for(let r=1;r<=10;r++)if(/REDES|FILIAIS/i.test(ct(ws.getRow(r).getCell(1).value))){hr=r;break}if(hr<0)hr=3;const c=acharCols(ws,hr);for(let r=hr+1;r<=ws.rowCount;r++){const l=ct(ws.getRow(r).getCell(1).value);if(!l||/^REDES|TOTAL|^\s*$/.test(l))continue;const k=norm(l);if(k&&!m.has(k))m.set(k,estado(ws.getRow(r),c))}return m}
function bate(a:Est,b:Est){for(const f of['chd','sai']as const){const av=a[f],bv=b[f];if(av==null&&bv==null)continue;if(av==null||bv==null)return false;if(Math.abs(av-bv)>TOL)return false}return true}

;(async () => {
  // Carrega paradas dia 19 pra investigar perdidos
  const paradas:any[]=[];let o=0
  while(true){const{data:p}=await sb.from('unitrac_paradas').select('placa_norm,codigo_loja,nome_loja,classificacao,lat,lng,chegada,unitrac_uploads!inner(data_relatorio)').eq('unitrac_uploads.data_relatorio',DIA).range(o,o+999);if(!p||!p.length)break;paradas.push(...p);if(p.length<1000)break;o+=1000}
  // cods bugados
  const cc=new Map<string,{la:number[];lo:number[]}>()
  for(const p of paradas){if(p.classificacao!=='LOJA'||!p.codigo_loja||p.lat==null)continue;const x=cc.get(p.codigo_loja)??{la:[],lo:[]};x.la.push(p.lat);x.lo.push(p.lng);cc.set(p.codigo_loja,x)}
  const cm=new Map<string,{lat:number;lng:number}>()
  for(const[k,v]of cc){const la=[...v.la].sort((a,b)=>a-b),lo=[...v.lo].sort((a,b)=>a-b);cm.set(k,{lat:la[la.length>>1],lng:lo[lo.length>>1]})}
  const bug=new Set<string>()
  const ks=[...cm.keys()]
  for(const k of ks){const s=cm.get(k)!;if(haversine(s.lat,s.lng,BASE_LAT,BASE_LNG)<1500)bug.add(k);for(const k2 of ks){if(k===k2)continue;const s2=cm.get(k2)!;if(haversine(s.lat,s.lng,s2.lat,s2.lng)<=100){bug.add(k);bug.add(k2)}}}
  // escala pra mapear loja→placa
  const esc:any[]=[];o=0
  while(true){const{data:p}=await sb.from('escala_linhas').select('rede_id,loja_nome_raw,placa_norm').eq('data_entrega',DIA).range(o,o+999);if(!p||!p.length)break;esc.push(...p);if(p.length<1000)break;o+=1000}
  const placaDe=new Map<string,string>() // rede|nomeNorm → placa
  for(const e of esc)if(e.loja_nome_raw&&e.placa_norm)placaDe.set(`${e.rede_id}|${norm(e.loja_nome_raw)}`,e.placa_norm)
  const parByPlaca=new Map<string,any[]>()
  for(const p of paradas){const a=parByPlaca.get(p.placa_norm)??[];a.push(p);parByPlaca.set(p.placa_norm,a)}

  const cats={ACERTO:0,ERRO_HORARIO:0,INVENTOU:0,NAO_ACHOU:0,SO_UM_LADO:0}
  const linhasTab:string[]=[]
  const casosNaoAchou:string[]=[], casosInventou:string[]=[], casosErro:string[]=[]

  for(const[rede,fm]of PARES){
    const wbM=new ExcelJS.Workbook();await wbM.xlsx.readFile(`${MANUAL_DIR}/${fm}`)
    const wbB=new ExcelJS.Workbook();await wbB.xlsx.readFile(`${BETA_DIR}/KPI-${rede}-${DIA}-BETA.xlsx`)
    const M=lerLojas(wbM.getWorksheet('19')??wbM.worksheets[0]), B=lerLojas(wbB.worksheets[0])
    let ac=0,eh=0,inv=0,na=0,so=0
    const todas=new Set([...M.keys(),...B.keys()])
    for(const k of todas){
      const m=M.get(k),b=B.get(k)
      if(!m||!b){so++;continue}
      const mTem=m.tipo==='horario',bTem=b.tipo==='horario'
      if(!mTem&&!bTem){ac++;continue}
      if(mTem&&bTem){if(bate(m,b)){ac++}else{eh++;casosErro.push(`[${rede}] ${k}: manual chd=${m.chd} sai=${m.sai} | sistema chd=${b.chd} sai=${b.sai}`)};continue}
      if(bTem&&!mTem){inv++;casosInventou.push(`[${rede}] ${k}: sistema preencheu (chd=${b.chd}) mas manual=${m.tipo}`);continue}
      if(mTem&&!bTem){
        na++
        // investiga no Unitrac
        const placa=placaDe.get(`${rede}|${k}`)
        const ps=(parByPlaca.get(placa??'')??[]).filter(p=>p.classificacao==='LOJA'&&p.codigo_loja)
        const limpas=ps.filter(p=>!bug.has(p.codigo_loja))
        const diag=!placa?'sem placa na escala':ps.length===0?'placa nao tem parada LOJA no Unitrac (dado ausente)':limpas.length===0?'placa so tem parada com cod BUGADO (esperado vazio)':`BUG: placa TEM parada limpa cod=${[...new Set(limpas.map(p=>p.codigo_loja))].join(',')}`
        casosNaoAchou.push(`[${rede}] ${k} (placa ${placa??'?'}): ${diag}`)
      }
    }
    cats.ACERTO+=ac;cats.ERRO_HORARIO+=eh;cats.INVENTOU+=inv;cats.NAO_ACHOU+=na;cats.SO_UM_LADO+=so
    const comp=ac+eh+inv // lojas que o sistema preencheu e dá pra avaliar
    const prec=ac+eh+inv>0?Math.round(100*ac/(ac+eh+inv)):0
    linhasTab.push(`| ${rede} | ${ac} | ${eh} | ${inv} | ${na} | ${prec}% |`)
  }

  console.log('\n## AUDITORIA gerado(sem geo) × manual — dia 19, tol 10min\n')
  console.log('| Rede | ✅ Acerto | ✗ Erro horário | ⚠️ Inventou | ⚠️ Não achou | Precisão* |')
  console.log('|------|:--:|:--:|:--:|:--:|:--:|')
  for(const l of linhasTab)console.log(l)
  console.log(`\n*Precisão = acertos / (tudo que o sistema preencheu). Total: ACERTO=${cats.ACERTO} ERRO=${cats.ERRO_HORARIO} INVENTOU=${cats.INVENTOU} NAO_ACHOU=${cats.NAO_ACHOU}`)

  console.log(`\n\n### ⚠️ SISTEMA NÃO ACHOU (${casosNaoAchou.length}) — manual tem, sistema vazio`)
  // agrupa por diagnóstico
  const bugs=casosNaoAchou.filter(c=>c.includes('BUG:'))
  const ausente=casosNaoAchou.filter(c=>c.includes('dado ausente'))
  const bugado=casosNaoAchou.filter(c=>c.includes('cod BUGADO'))
  console.log(`\n#### 🔴 BUG do sistema (tinha parada limpa, devia preencher): ${bugs.length}`)
  bugs.forEach(c=>console.log('  '+c))
  console.log(`\n#### ⚪ Dado ausente no Unitrac (placa sem parada LOJA): ${ausente.length}`)
  ausente.slice(0,20).forEach(c=>console.log('  '+c))
  console.log(`\n#### 🟠 Só cod bugado (esperado vazio, correto): ${bugado.length}`)
  bugado.slice(0,20).forEach(c=>console.log('  '+c))

  console.log(`\n\n### ⚠️ SISTEMA INVENTOU (${casosInventou.length}) — sistema preencheu, manual não`)
  casosInventou.slice(0,25).forEach(c=>console.log('  '+c))

  console.log(`\n\n### ✗ ERRO DE HORÁRIO (${casosErro.length})`)
  casosErro.slice(0,25).forEach(c=>console.log('  '+c))
})().catch(e=>{console.error(e);process.exit(1)})
