import ExcelJS from 'exceljs'
import { readFile } from 'fs/promises'

const BASE = 'C:\\Users\\media\\OneDrive\\EMPRESA TRIFORCE AUTO\\clientes\\tia-erica\\CONVERSAS COM ERICA\\escalas\\'

async function checkEscala(fname, tipo) {
  const buf = await readFile(BASE + fname)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const names = wb.worksheets.map(ws => ws.name)
  console.log('\n=== ' + tipo + ' ===')
  console.log('Abas:', names.join(' | '))

  // Check cell M1 on each numeric tab
  const SKIP = new Set(['2° ENTREGA ', 'ARMAZEM ', 'ARMAZÉM ', 'MOTORISTAS', 'MATRIZ'])
  const RE = /^\d{1,2}\s*$/
  wb.eachSheet(ws => {
    if (SKIP.has(ws.name)) return
    const t = ws.name.trim()
    if (!RE.test(t)) return
    const v = ws.getRow(1).getCell(13).value
    if (v instanceof Date) {
      // Use local time methods to match formataDataISO
      const y = v.getFullYear(), m = String(v.getMonth()+1).padStart(2,'0'), d = String(v.getDate()).padStart(2,'0')
      console.log('  aba', t, '->', `${y}-${m}-${d}`)
    } else {
      console.log('  aba', t, '-> M1 =', v, '(tipo: ' + typeof v + ')')
    }
  })
}

async function checkZonaSul() {
  const buf = await readFile(BASE + 'ESCALA ZONA SUL - MAIO.xlsx')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  console.log('\n=== ZONA_SUL ===')
  console.log('Abas:', wb.worksheets.map(ws => ws.name).join(' | '))
  // Check first data row on MATRIZ tab
  const ws = wb.worksheets.find(w => w.name.toUpperCase().includes('MATRIZ'))
  if (ws) {
    console.log('Aba MATRIZ - linhas amostras (cols 1-10):')
    for (let r = 1; r <= 5; r++) {
      const row = ws.getRow(r)
      const vals = []
      for (let c = 1; c <= 10; c++) {
        const v = row.getCell(c).value
        if (v !== null && v !== undefined) vals.push('[' + c + ']: ' + JSON.stringify(v))
      }
      if (vals.length) console.log('  row ' + r + ':', vals.join(', '))
    }
  }
}

async function checkUnitrac() {
  const path = 'C:\\Users\\media\\OneDrive\\EMPRESA TRIFORCE AUTO\\clientes\\tia-erica\\CONVERSAS COM ERICA\\relatorios-unitrac\\relatorio_unitrac_9086.xlsx'
  const buf = await readFile(path)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  console.log('\n=== UNITRAC ===')
  const names = wb.worksheets.map(ws => ws.name)
  console.log('Total abas:', names.length, '| Primeiras:', names.slice(0,5).join(' | '))
  const ws = wb.worksheets[0]
  console.log('Aba "' + ws.name + '" - primeiras 3 linhas:')
  for (let r = 1; r <= 3; r++) {
    const row = ws.getRow(r)
    const vals = []
    for (let c = 1; c <= 15; c++) {
      const v = row.getCell(c).value
      if (v !== null && v !== undefined) vals.push('[' + c + ']: ' + JSON.stringify(String(v).slice(0,30)))
    }
    if (vals.length) console.log('  row ' + r + ':', vals.join(', '))
  }
}

await checkEscala('ESCALA GERAL DE MAIO 1.xlsx', 'GERAL')
await checkZonaSul()
await checkEscala('ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO.xlsx', 'PAX')
await checkUnitrac()
