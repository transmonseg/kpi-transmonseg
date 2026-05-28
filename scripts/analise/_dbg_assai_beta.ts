import ExcelJS from 'exceljs'
function ct(v: any): string { if(v==null)return''; if(v instanceof Date)return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`; if(typeof v==='object'){if(v.text)return v.text;if(v.result!=null)return ct(v.result);if(v.richText)return v.richText.map((r:any)=>r.text).join('');return''} return String(v).trim() }
;(async () => {
  const wbB = new ExcelJS.Workbook(); await wbB.xlsx.readFile('docs/conversas-tia-erica/kpi-beta/KPI-ASSAI-2026-05-19-BETA.xlsx')
  const wbM = new ExcelJS.Workbook(); await wbM.xlsx.readFile('C:/Users/media/Downloads/KPI SMANUAIS/KPI ASSAI (4).xlsx')
  const wsB = wbB.worksheets[0], wsM = wbM.getWorksheet('19')!
  console.log('=== BETA ASSAI (loja | cd/chd/sai) ===')
  for (let r = 5; r <= 20; r++) { const l = ct(wsB.getRow(r).getCell(1).value); if(!l)continue; console.log(' ', l.slice(0,32).padEnd(32), ct(wsB.getRow(r).getCell(5).value), ct(wsB.getRow(r).getCell(6).value), ct(wsB.getRow(r).getCell(7).value)) }
  console.log('\n=== MANUAL ASSAI ===')
  for (let r = 5; r <= 20; r++) { const l = ct(wsM.getRow(r).getCell(1).value); if(!l)continue; console.log(' ', l.slice(0,32).padEnd(32), ct(wsM.getRow(r).getCell(5).value), ct(wsM.getRow(r).getCell(6).value), ct(wsM.getRow(r).getCell(7).value)) }
})()
