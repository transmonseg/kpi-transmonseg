import { readFileSync, readdirSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import ExcelJS from 'exceljs'
import { config } from 'dotenv'
config({ path: '.env.local' })

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

function fmtT(d: Date | string | null): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

;(async () => {
  const pasta21 = `${BASE}/ESCALA DIA 21`
  const files = readdirSync(pasta21)
  const armFile = files.find(f => /ARMAZ.M.*GR.O/i.test(f) && f.endsWith('.xlsx'))!
  console.log(`Escala ARMAZEM: ${armFile}\n`)

  // Lê a aba "21" da escala armazem
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(`${pasta21}/${armFile}`)
  const sheets = wb.worksheets.map(w => w.name)
  console.log(`Abas disponíveis: ${sheets.join(', ')}\n`)

  // GPS Unitrac do dia 21
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta21}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta21}/${pdfFile}`), new Set()).catch(() => []))

  console.log(`Veículos GPS dia 21: ${veiculos.length}`)
  // Mostra placas com paradas LOJA "ARMAZEM" ou "REGINA"
  for (const v of veiculos) {
    const lojasArm = v.paradas.filter((p: any) => p.classificacao === 'LOJA' && /ARMAZ|REGINA|GRAO|GR.O/i.test(p.local_parada || ''))
    if (!lojasArm.length) continue
    console.log(`\n${v.placa_norm}:`)
    for (const p of lojasArm.slice(0, 8)) {
      console.log(`  ${fmtT(p.chegada)} → ${fmtT(p.saida)}  local=${p.local_parada?.slice(0,50)}`)
    }
  }

  // Lê o KPI gerado do ARMAZEM dia 21
  const gerPath = 'C:/Users/media/Downloads/teste dia 21/KPI-ARMAZEM_GRAO-2026-05-21 (3).xlsx'
  const gwb = new ExcelJS.Workbook()
  await gwb.xlsx.readFile(gerPath)
  const gws = gwb.worksheets[0]
  console.log(`\nKPI gerado ARMAZEM dia 21 — primeiras 20 linhas:`)
  for (let r = 1; r <= Math.min(20, gws.rowCount); r++) {
    const cells = []
    for (let c = 1; c <= 8; c++) {
      const v = gws.getRow(r).getCell(c).value
      cells.push(typeof v === 'object' && v && 'result' in v ? (v as any).result : v)
    }
    console.log(`  R${r}: ${cells.map(c => String(c ?? '').slice(0, 25)).join(' | ')}`)
  }
})()
