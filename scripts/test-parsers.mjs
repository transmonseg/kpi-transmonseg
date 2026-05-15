import { readFile } from 'fs/promises'
import ExcelJS from 'exceljs'
const JSZip = (await import('jszip')).default

const BASE = 'C:\\Users\\media\\OneDrive\\EMPRESA TRIFORCE AUTO\\clientes\\tia-erica\\CONVERSAS COM ERICA\\'

async function normalizeXlsxNamespaces(buf) {
  try {
    const zip = new JSZip()
    await zip.loadAsync(buf)
    let needsRebuild = false
    const xmlEntries = zip.file(/\.xml$/)
    for (const entry of xmlEntries) {
      const xml = await entry.async('string')
      if (!/<\w+:\w/.test(xml)) continue
      const normalized = xml
        .replace(/(<\/?)(\w+):(\w)/g, '$1$3')
        .replace(/xmlns:\w+="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml/g,
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml')
        .replace(/xmlns:\w+="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/extended-properties/g,
          'xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties')
      zip.file(entry.name, normalized)
      needsRebuild = true
    }
    if (!needsRebuild) return buf
    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  } catch (e) {
    console.error('normalizeXlsxNamespaces error:', e.message)
    return buf
  }
}

// ─── UNITRAC ──────────────────────────────────────────────────────────────────
async function testUnitrac() {
  console.log('\n=== UNITRAC ===')
  const buf = await readFile(BASE + 'relatorios-unitrac\\relatorio_unitrac_9086.xlsx')
  const fixed = await normalizeXlsxNamespaces(buf)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(fixed)
  const sheets = wb.worksheets
  console.log('Carregou!', sheets.length, 'abas (veiculos)')
  const ws = sheets[0]
  console.log('Aba 1:', ws.name)
  for (let r = 1; r <= 8; r++) {
    const row = ws.getRow(r)
    const vals = []
    for (let c = 1; c <= 12; c++) {
      const v = row.getCell(c).value
      if (v !== null && v !== undefined) {
        const s = v instanceof Date ? v.toISOString() : String(v).slice(0, 30)
        vals.push('[' + c + ']: ' + s)
      }
    }
    if (vals.length) console.log('  row ' + r + ':', vals.join(', '))
  }
}

// ─── GERAL timezone fix ───────────────────────────────────────────────────────
async function testGeral() {
  console.log('\n=== GERAL (datas com fix UTC) ===')
  const buf = await readFile(BASE + 'escalas\\ESCALA GERAL DE MAIO 1.xlsx')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const SKIP = new Set(['2° ENTREGA ', 'ARMAZEM ', 'ARMAZÉM ', 'MOTORISTAS', 'MATRIZ'])
  const RE = /^\d{1,2}\s*$/
  let count = 0
  wb.eachSheet(ws => {
    if (SKIP.has(ws.name)) return
    if (!RE.test(ws.name.trim())) return
    const v = ws.getRow(1).getCell(13).value
    if (v instanceof Date) {
      // Fixed: use UTC components
      const y = v.getUTCFullYear(), m = String(v.getUTCMonth()+1).padStart(2,'0'), d = String(v.getUTCDate()).padStart(2,'0')
      console.log(' ', ws.name.trim(), '->', `${y}-${m}-${d}`)
      count++
    }
  })
  console.log('Total abas com data:', count)
}

await testUnitrac()
await testGeral()
