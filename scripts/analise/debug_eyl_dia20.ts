/**
 * Compara EYL8B91 dia 20 XLSX raw vs PDF
 */
import ExcelJS from 'exceljs'
import { readFileSync } from 'fs'

;(async () => {
  const wb = new ExcelJS.Workbook()
  // Normalizar namespaces
  const { default: JSZip } = await import('jszip')
  const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/relatorio_9573.xlsx')
  const zip = new JSZip()
  await zip.loadAsync(buf)
  let needsRebuild = false
  for (const entry of zip.file(/\.xml$/)) {
    const isXl = entry.name.startsWith('xl/')
    const isAppXml = entry.name === 'docProps/app.xml'
    if (!isXl && !isAppXml) continue
    const xml: string = await entry.async('string')
    if (!/<\w+:\w/.test(xml)) continue
    const stripped = xml.replace(/<(\/?)\w+:(\w)/g, '<$1$2')
    zip.file(entry.name, stripped)
    needsRebuild = true
  }
  const finalBuf = needsRebuild ? await zip.generateAsync({ type: 'nodebuffer' }) : buf
  await wb.xlsx.load(finalBuf as any)

  const ws = wb.worksheets.find(w => w.name.includes('EYL'))
  if (!ws) { console.log('Aba EYL não achada'); return }
  console.log(`Aba: ${ws.name}, rows: ${ws.rowCount}`)
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cells: string[] = []
    for (let c = 1; c <= 11; c++) {
      const v = row.getCell(c).value
      const s = v == null ? '' : (v instanceof Date ? v.toISOString().slice(11, 19) : (typeof v === 'object' ? JSON.stringify(v).slice(0, 50) : String(v).slice(0, 50)))
      cells.push(s.padEnd(20))
    }
    console.log(`R${r}: ${cells.join('|')}`)
  }
})()
