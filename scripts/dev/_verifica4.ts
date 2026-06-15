import ExcelJS from 'exceljs'
const KPI='C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-31 (4).xlsx'
const txt=(v:any)=>{if(v==null)return'';if(typeof v==='object'&&!(v instanceof Date))return String(v.text??v.result??'');return String(v)}
const hora=(v:any)=>{if(v==null||v==='')return null;if(v instanceof Date)return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`;if(typeof v==='number'){const m=Math.round(v*1440);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}if(typeof v==='object')return hora(v.result??v.text);return String(v)}
const tem=(v:any)=>typeof v==='number'||v instanceof Date
async function main(){
  const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(KPI)
  console.log('ABAS:',wb.worksheets.map(w=>w.name).join(', '),'\n')
  const ws=wb.worksheets[0]
  let prob=0,com2=0
  const foco=['21','30','33','36','48']
  ws.eachRow((row,n)=>{
    if(n<=3)return
    const loja=txt(row.getCell(1).value).trim()
    if(!loja||/redes|filiais|carro|relat/i.test(loja))return
    const p1=txt(row.getCell(4).value),p2=txt(row.getCell(10).value)
    if(!p2)return
    com2++
    const h1=tem(row.getCell(5).value)||tem(row.getCell(6).value)
    const h2=tem(row.getCell(11).value)||tem(row.getCell(12).value)
    if(!h1&&h2){prob++;console.log(`⚠️ ${loja}: 1º ${p1}(sem hora) | 2º ${p2}(TEM hora) <-- ERRADO`)}
    const num=loja.match(/Loja (\d+)/)?.[1]
    if(num&&foco.includes(num))console.log(`✓ ${loja}: 1º ${p1} [CD ${hora(row.getCell(5).value)} chg ${hora(row.getCell(6).value)}] | 2º ${p2} [CD ${hora(row.getCell(11).value)}]`)
  })
  console.log(`\nLojas c/ 2 carros: ${com2} | carro-com-hora no 2º slot (erro): ${prob}`)
}
main()
