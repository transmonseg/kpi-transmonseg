// Comparação detalhada de um dia: por rede, TODAS as lojas, manual vs gerado(-FF).
// Casa por placa nos 2 carros. Imprime cada entrega com status.
// Uso: node scripts/analise/cmp_dia.js <dia>
const ExcelJS = require('exceljs')
const MANUAL_DIR='C:/Users/media/Downloads/KPI SMANUAIS', FF='docs/conversas-tia-erica/kpi-beta', TOL=10
const dia=process.argv[2]
const PARES=[['ARMAZEM_GRAO','KPI ARMAZEM DO GRAO (2).xlsx'],['ASSAI','KPI ASSAI (4).xlsx'],['ATACADAO','KPI ATACADAO (4).xlsx'],['CARREFOUR','KPI CARREFOUR (4).xlsx'],['GUANABARA','KPI GUANABARA (4).xlsx'],['PREZUNIC','KPI PREZUNIC (6).xlsx'],['PRINCESA','KPI PRINCESA (11).xlsx'],['SUPER_PAX','KPI SUPERPAX.xlsx'],['SUPERPRIX','KPI SUPERPRIX (4).xlsx'],['ZONA_SUL','KPI ZONA SUL.xlsx']]
function norm(s){let x=s.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/FILIAL/g,'F').replace(/\bLOJA\b/g,'').replace(/[^A-Z0-9]+/g,' ').trim();x=x.replace(/^(PAX|GB|ASSAI|SENDAS|PREZUNIC|CARREFOUR|PRINCESA|SUPERPRIX|ATACADAO|GUANABARA|VIANENSE|SAM ?S|MUNDIAL|ZONA SUL)\s+/,'');x=x.replace(/\s*\d*\s*CARRO.*$/,'').trim();return x}
function pn(s){return s.replace(/[^A-Z0-9]/gi,'').toUpperCase()}
function ct(v){if(v==null)return'';if(v instanceof Date)return String(v.getUTCHours()).padStart(2,'0')+':'+String(v.getUTCMinutes()).padStart(2,'0');if(typeof v==='object'){if(v.text)return v.text;if(v.result!=null)return ct(v.result);if(v.richText)return v.richText.map(r=>r.text).join('');return''}return String(v).trim()}
function tm(s){const m=s.match(/(\d{1,2}):(\d{2})/);return m?+m[1]*60+ +m[2]:null}
function slots(ws,hr){const row=ws.getRow(hr),pl=[],ch=[],sa=[];for(let c=1;c<=ws.columnCount;c++){const t=ct(row.getCell(c).value).toUpperCase().replace(/\s+/g,' ');if(/^PLACA/.test(t))pl.push(c);else if(/CH?D LOJA|CHEGAD/.test(t))ch.push(c);else if(/SAIDA LOJA/.test(t))sa.push(c)}const s=[];for(let i=0;i<pl.length;i++)if(ch[i]!=null&&sa[i]!=null)s.push({p:pl[i],c:ch[i],s:sa[i]});return s}
function ler(ws){let hr=-1;for(let r=1;r<=10;r++)if(/REDES|FILIAIS/i.test(ct(ws.getRow(r).getCell(1).value))){hr=r;break}if(hr<0)hr=3;const sl=slots(ws,hr);const m=new Map();for(let r=hr+1;r<=ws.rowCount;r++){const loja=ct(ws.getRow(r).getCell(1).value);if(!loja||/^REDES|TOTAL/.test(loja)||loja.length<2)continue;const k=norm(loja);const ents=[];for(const s of sl){const placa=pn(ct(ws.getRow(r).getCell(s.p).value));const txt=(ct(ws.getRow(r).getCell(s.c).value)+' '+ct(ws.getRow(r).getCell(s.s).value)).toUpperCase();const sem=/SEM\s*RASTREAD/.test(txt),naofoi=/N[ÃA]O\s*FOI/.test(txt);const chd=tm(ct(ws.getRow(r).getCell(s.c).value)),sai=tm(ct(ws.getRow(r).getCell(s.s).value));if(placa||chd!=null||sem||naofoi)ents.push({placa,chd,sai,sem,naofoi,lojaRaw:loja})}if(ents.length)m.set(k,(m.get(k)||[]).concat(ents))}return m}
function f(n){return n==null?'--':String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
;(async()=>{
  for(const [rede,fm] of PARES){
    let wm,wg; try{wm=new ExcelJS.Workbook();await wm.xlsx.readFile(MANUAL_DIR+'/'+fm)}catch{continue}
    const wsM=wm.getWorksheet(dia); if(!wsM)continue
    try{wg=new ExcelJS.Workbook();await wg.xlsx.readFile(`${FF}/KPI-${rede}-2026-05-${dia}-FF.xlsx`)}catch{continue}
    const M=ler(wsM),G=ler(wg.worksheets[0])
    const linhas=[]
    for(const [loja,ents] of M){
      const gents=G.get(loja)||[]
      for(const em of ents){
        if(em.chd==null) continue // manual nao preencheu (sem rastre/nao foi) — ignora
        let eb=em.placa?gents.find(x=>x.placa===em.placa):null
        if(!eb)eb=gents.find(x=>x.chd!=null)
        let st
        if(!eb||eb.chd==null) st='VAZIO_SISTEMA'
        else{const dc=Math.abs(em.chd-eb.chd),ds=em.sai!=null&&eb.sai!=null?Math.abs(em.sai-eb.sai):0;st=(dc<=TOL&&ds<=TOL+5)?'OK':`DIVERG(chd ${dc}min, sai ${ds}min)`}
        linhas.push(`    ${st.padEnd(22)} ${em.lojaRaw.slice(0,30).padEnd(30)} placa=${em.placa||'?'} M:${f(em.chd)}/${f(em.sai)} G:${eb?f(eb.chd)+'/'+f(eb.sai):'--'}`)
      }
    }
    if(linhas.length){console.log(`\n### ${rede} (${dia})`);linhas.forEach(l=>console.log(l))}
  }
})().catch(e=>{console.error(e);process.exit(1)})
