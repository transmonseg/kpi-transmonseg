/**
 * Lê o XLSX cru da placa LQU5546 e mostra as linhas raw pra ver se
 * o parser está pulando paradas ou se elas REALMENTE não estão no XLSX.
 */
import ExcelJS from 'exceljs'
import { readFileSync } from 'fs'

;(async () => {
  const wb = new ExcelJS.Workbook()
  // Usar o normalizador do parseUnitrac via loadAsync direto
  const { default: JSZip } = await import('jszip')
  const buf = readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/relatorio_9391.xlsx')

  // Normalizar namespaces (mesma lógica do parseUnitrac)
  const zip = new JSZip()
  await zip.loadAsync(buf)
  let needsRebuild = false
  const xmlEntries = zip.file(/\.xml$/)
  for (const entry of xmlEntries) {
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

  console.log(`Total worksheets: ${wb.worksheets.length}`)
  console.log('Primeiras 10 abas:', wb.worksheets.slice(0, 10).map(w => w.name).join(', '))
  console.log('Existe aba LQU5546?', wb.worksheets.some(w => w.name.includes('LQU')))

  // Procura aba LQU
  const wsLqu = wb.worksheets.find(w => w.name.includes('LQU'))
  if (!wsLqu) { console.log('Não achei aba LQU'); return }
  const ws = wsLqu
  console.log(`\nUsando sheet: ${ws.name}, rows: ${ws.rowCount}, cols: ${ws.columnCount}`)

  // Procurar LQU5546 no XLSX
  console.log('\nLinhas contendo LQU5546:')
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cells: string[] = []
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = row.getCell(c).value
      const s = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))
      cells.push(s)
    }
    const text = cells.join('|')
    if (text.includes('LQU') || text.includes('LQU5546')) {
      console.log(`Row ${r}:`)
      cells.forEach((c, i) => { if (c) console.log(`  Col${i+1}: ${c.slice(0, 100)}`) })
      console.log('  ---')
    }
  }

  // Mostrar 30 linhas em volta da primeira aparição
  console.log('\n\nProcurar onde está LQU5546 e ver paradas em volta:')
  let firstRow = -1
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = String(row.getCell(c).value ?? '')
      if (v.includes('LQU') || v.includes('LQU5546') || v.includes('LQU-5546')) {
        firstRow = r
        break
      }
    }
    if (firstRow > 0) break
  }

  if (firstRow > 0) {
    console.log(`\nLQU5546 começa na row ${firstRow}. Lendo ${firstRow}-${firstRow + 40}:`)
    for (let r = firstRow; r <= Math.min(firstRow + 40, ws.rowCount); r++) {
      const row = ws.getRow(r)
      const cells: string[] = []
      for (let c = 1; c <= 12; c++) {
        const v = row.getCell(c).value
        const s = v == null ? '' : (v instanceof Date ? v.toISOString().slice(11, 19) : (typeof v === 'object' ? JSON.stringify(v).slice(0, 50) : String(v).slice(0, 50)))
        cells.push(s.padEnd(20))
      }
      console.log(`R${r}: ${cells.join('|')}`)
    }
  }
})().catch(e => { console.error(e); process.exit(1) })
