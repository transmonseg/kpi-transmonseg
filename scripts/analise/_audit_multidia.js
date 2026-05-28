// Compara gerado sem-geo × manual para CADA dia, lendo a aba correspondente.
// Casa por placa dentro da loja, lê os 2 carros, tolerância 10min.
const ExcelJS = require('exceljs')
const { execSync } = require('child_process')

const MANUAL_DIR = 'C:/Users/media/Downloads/KPI SMANUAIS'
const BETA_DIR = 'docs/conversas-tia-erica/kpi-beta'
const TOL = 10
const DIAS = ['18','19','20','21','22','25']
const PARES = [
  ['ARMAZEM_GRAO','KPI ARMAZEM DO GRAO (2).xlsx'],['ASSAI','KPI ASSAI (4).xlsx'],
  ['ATACADAO','KPI ATACADAO (4).xlsx'],['CARREFOUR','KPI CARREFOUR (4).xlsx'],
  ['GUANABARA','KPI GUANABARA (4).xlsx'],['PREZUNIC','KPI PREZUNIC (6).xlsx'],
  ['PRINCESA','KPI PRINCESA (11).xlsx'],['SUPER_PAX','KPI SUPERPAX.xlsx'],
  ['SUPERPRIX','KPI SUPERPRIX (4).xlsx'],['ZONA_SUL','KPI ZONA SUL.xlsx'],
]
function norm(s){let x=s.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/FILIAL/g,'F').replace(/\bLOJA\b/g,'').replace(/[^A-Z0-9]+/g,' ').trim();x=x.replace(/^(PAX|GB|ASSAI|SENDAS|PREZUNIC|CARREFOUR|PRINCESA|SUPERPRIX|ATACADAO|GUANABARA|VIANENSE|SAM ?S|MUNDIAL|ZONA SUL)\s+/,'');x=x.replace(/\s*\d*\s*CARRO.*$/,'').trim();return x}
function placaN(s){return s.replace(/[^A-Z0-9]/gi,'').toUpperCase()}
function ct(v){if(v==null)return'';if(v instanceof Date)return String(v.getUTCHours()).padStart(2,'0')+':'+String(v.getUTCMinutes()).padStart(2,'0');if(typeof v==='object'){if(v.text)return v.text;if(v.result!=null)return ct(v.result);if(v.richText)return v.richText.map(r=>r.text).join('');return''}return String(v).trim()}
function toMin(s){const m=s.match(/(\d{1,2}):(\d{2})/);return m?+m[1]*60+ +m[2]:null}
function acharSlots(ws,hr){const row=ws.getRow(hr);const pl=[],ch=[],sa=[];for(let c=1;c<=ws.columnCount;c++){const t=ct(row.getCell(c).value).toUpperCase().replace(/\s+/g,' ');if(/^PLACA/.test(t))pl.push(c);else if(/CH?D LOJA|CHEGAD/.test(t))ch.push(c);else if(/SAIDA LOJA/.test(t))sa.push(c)}const s=[];for(let i=0;i<pl.length;i++)if(ch[i]!=null&&sa[i]!=null)s.push({placa:pl[i],chd:ch[i],sai:sa[i]});return s}
function lerEnt(ws){let hr=-1;for(let r=1;r<=10;r++)if(/REDES|FILIAIS/i.test(ct(ws.getRow(r).getCell(1).value))){hr=r;break}if(hr<0)hr=3;const slots=acharSlots(ws,hr);const m=new Map();for(let r=hr+1;r<=ws.rowCount;r++){const loja=ct(ws.getRow(r).getCell(1).value);if(!loja||/^REDES|TOTAL|^\s*$/.test(loja))continue;const k=norm(loja);if(!k)continue;const ents=[];for(const s of slots){const placa=placaN(ct(ws.getRow(r).getCell(s.placa).value));const txt=(ct(ws.getRow(r).getCell(s.chd).value)+' '+ct(ws.getRow(r).getCell(s.sai).value)).toUpperCase();const sem=/SEM\s*RASTREAD/.test(txt);const naofoi=/N[ÃA]O\s*FOI/.test(txt);const chd=toMin(ct(ws.getRow(r).getCell(s.chd).value));const sai=toMin(ct(ws.getRow(r).getCell(s.sai).value));if(placa||chd!=null||sem||naofoi)ents.push({placa,chd,sai});}m.set(k,(m.get(k)||[]).concat(ents))}return m}
function bate(a,b){for(const f of['chd','sai']){if(a[f]==null&&b[f]==null)continue;if(a[f]==null||b[f]==null)return false;if(Math.abs(a[f]-b[f])>TOL)return false}return true}

;(async()=>{
  const totaisPorRede={}
  for(const dia of DIAS){
    // gera sem-geo pro dia
    execSync(`npx tsx scripts/analise/gerar_kpi_semgeo.ts 2026-05-${dia}`,{stdio:'ignore'})
    console.log(`\n══════ DIA ${dia} ══════`)
    for(const [rede,fm] of PARES){
      let wbM,wbB
      try{ wbM=new ExcelJS.Workbook(); await wbM.xlsx.readFile(MANUAL_DIR+'/'+fm) }catch{continue}
      const wsM=wbM.getWorksheet(dia); if(!wsM)continue // aba do dia não existe → ignora
      try{ wbB=new ExcelJS.Workbook(); await wbB.xlsx.readFile(`${BETA_DIR}/KPI-${rede}-2026-05-${dia}-BETA.xlsx`) }catch{continue}
      const M=lerEnt(wsM), B=lerEnt(wbB.worksheets[0])
      let man=0,ok=0,perd=0,err=0
      for(const [loja,entsM] of M){
        const entsB=B.get(loja)||[]
        for(const em of entsM){
          if(em.chd==null)continue
          man++
          let eb=em.placa?entsB.find(x=>x.placa===em.placa):null
          if(!eb)eb=entsB.find(x=>x.chd!=null)
          if(eb&&eb.chd!=null&&bate(em,eb))ok++
          else if(!eb||eb.chd==null)perd++
          else err++
        }
      }
      if(man===0)continue
      const k=rede; totaisPorRede[k]=totaisPorRede[k]||{man:0,ok:0}; totaisPorRede[k].man+=man; totaisPorRede[k].ok+=ok
      console.log(`  ${rede.padEnd(13)} ${ok}/${man} (${Math.round(100*ok/man)}%)  perdidos=${perd} erro_horario=${err}`)
    }
  }
  console.log('\n══════ CONSOLIDADO 6 DIAS (por rede) ══════')
  let tMan=0,tOk=0
  for(const [rede,v] of Object.entries(totaisPorRede).sort((a,b)=>(b[1].ok/b[1].man)-(a[1].ok/a[1].man))){
    console.log(`  ${rede.padEnd(13)} ${v.ok}/${v.man} (${Math.round(100*v.ok/v.man)}%)`); tMan+=v.man; tOk+=v.ok
  }
  console.log(`  ${'TOTAL'.padEnd(13)} ${tOk}/${tMan} (${Math.round(100*tOk/tMan)}%)`)
})().catch(e=>{console.error(e);process.exit(1)})
