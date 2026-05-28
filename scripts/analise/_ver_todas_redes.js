const ExcelJS = require('exceljs')
function fmt(v){if(v==null)return'';if(v instanceof Date)return String(v.getUTCHours()).padStart(2,'0')+':'+String(v.getUTCMinutes()).padStart(2,'0');if(typeof v==='object'&&v.text)return v.text;if(typeof v==='object'&&v.result!=null)return fmt(v.result);if(typeof v==='object'&&v.richText)return v.richText.map(r=>r.text).join('');return String(v).trim()}
function toMin(s){const m=s.match(/(\d{1,2}):(\d{2})/);return m?+m[1]*60+ +m[2]:null}
function dif(a,b){const am=toMin(a),bm=toMin(b);if(am==null||bm==null)return 999;return Math.abs(am-bm)}
const PARES=[
  ['PRINCESA','KPI PRINCESA (11).xlsx','KPI-PRINCESA-2026-05-19-BETA.xlsx'],
  ['PREZUNIC','KPI PREZUNIC (6).xlsx','KPI-PREZUNIC-2026-05-19-BETA.xlsx'],
  ['GUANABARA','KPI GUANABARA (4).xlsx','KPI-GUANABARA-2026-05-19-BETA.xlsx'],
  ['ASSAI','KPI ASSAI (4).xlsx','KPI-ASSAI-2026-05-19-BETA.xlsx'],
  ['ZONA_SUL','KPI ZONA SUL.xlsx','KPI-ZONA_SUL-2026-05-19-BETA.xlsx'],
  ['CARREFOUR','KPI CARREFOUR (4).xlsx','KPI-CARREFOUR-2026-05-19-BETA.xlsx'],
  ['SUPERPRIX','KPI SUPERPRIX (4).xlsx','KPI-SUPERPRIX-2026-05-19-BETA.xlsx'],
  ['ATACADAO','KPI ATACADAO (4).xlsx','KPI-ATACADAO-2026-05-19-BETA.xlsx'],
  ['SUPER_PAX','KPI SUPERPAX.xlsx','KPI-SUPER_PAX-2026-05-19-BETA.xlsx'],
  ['ARMAZEM','KPI ARMAZEM DO GRAO (2).xlsx','KPI-ARMAZEM_GRAO-2026-05-19-BETA.xlsx'],
];
(async()=>{
  for(const [rede,fm,fg] of PARES){
    const m=new ExcelJS.Workbook(); await m.xlsx.readFile('C:/Users/media/Downloads/KPI SMANUAIS/'+fm);
    const g=new ExcelJS.Workbook(); await g.xlsx.readFile('docs/conversas-tia-erica/kpi-beta/'+fg);
    const wm=m.getWorksheet('19')||m.worksheets[0]; const wg=g.worksheets[0];
    console.log('\n=== '+rede+' ===');
    for(let r=5;r<=Math.max(wm.rowCount,wg.rowCount);r++){
      const loja=fmt(wm.getRow(r).getCell(1).value)||fmt(wg.getRow(r).getCell(1).value);
      if(!loja||loja.length<2) continue;
      const mcd=fmt(wm.getRow(r).getCell(5).value);
      const mchd=fmt(wm.getRow(r).getCell(6).value);
      const msai=fmt(wm.getRow(r).getCell(7).value);
      const gcd=fmt(wg.getRow(r).getCell(5).value);
      const gchd=fmt(wg.getRow(r).getCell(6).value);
      const gsai=fmt(wg.getRow(r).getCell(7).value);
      const mVazio=!mchd||/SEM|NÃO|NAO/i.test(mchd+mcd);
      const gVazio=!gchd||/SEM|NÃO|NAO/i.test(gchd+gcd);
      if(mVazio&&gVazio) continue;
      let st;
      if(!mVazio&&gVazio) st='⚪SEM(sys vazio)';
      else if(mVazio&&!gVazio) st='⚠️SYS INVENTOU';
      else{
        const dc=dif(mchd,gchd), ds=dif(msai,gsai);
        if(dc<=10&&ds<=15) st='✅OK';
        else st='❌ CHD+'+dc+'min SAI+'+ds+'min';
      }
      if(st==='✅OK') continue;
      console.log(st+' | '+loja.slice(0,38).padEnd(38)+' M:'+mchd+'/'+msai+' G:'+gchd+'/'+gsai);
    }
  }
})().catch(e=>{console.error(e);process.exit(1)})
