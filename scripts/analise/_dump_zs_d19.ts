/**
 * Dump puro dos arquivos pra auditoria manual ZS dia 19.
 * NÃO compara nada. Apenas lê e escreve em formato legível.
 *
 * Output: docs/auditoria/dump-zs-d19/*.md
 */
import ExcelJS from 'exceljs'
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'fs'

const OUT = 'docs/auditoria/dump-zs-d19'
mkdirSync(OUT, { recursive: true })

function cell(c: ExcelJS.Cell | undefined): string {
  if (!c) return ''
  const v = c.value
  if (v == null) return ''
  if (v instanceof Date) {
    const h = v.getUTCHours()
    const m = v.getUTCMinutes()
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }
  if (typeof v === 'object' && 'result' in v) {
    const r = (v as any).result
    if (r instanceof Date) return `${String(r.getUTCHours()).padStart(2,'0')}:${String(r.getUTCMinutes()).padStart(2,'0')}`
    return String(r ?? '')
  }
  if (typeof v === 'object' && 'text' in v) return String((v as any).text)
  if (typeof v === 'object' && 'richText' in v) return (v as any).richText.map((r: any) => r.text).join('')
  return String(v).trim()
}

async function dumpSheet(path: string, sheetName: string | undefined, outFile: string, title: string, maxCols = 25) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0]
  if (!ws) { writeFileSync(outFile, `# ${title}\n\nABA "${sheetName}" não encontrada\n`); return }

  let out = `# ${title}\n\n`
  out += `Arquivo: \`${path}\`\n`
  out += `Aba: \`${ws.name}\` (${ws.rowCount} linhas, ${ws.columnCount} colunas)\n\n`
  out += '```\n'
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cells: string[] = []
    for (let c = 1; c <= Math.min(maxCols, ws.columnCount); c++) {
      cells.push(cell(row.getCell(c)).slice(0, 20).padEnd(20))
    }
    out += `R${String(r).padStart(3)}: ${cells.join('|')}\n`
  }
  out += '```\n'
  writeFileSync(outFile, out)
  console.log(`✓ ${outFile}`)
}

;(async () => {
  // 1. KPI gerado
  await dumpSheet(
    'C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-19 (8).xlsx',
    undefined,
    `${OUT}/1-kpi-gerado.md`,
    'KPI GERADO ZS dia 19',
    10,
  )

  // 2. KPI manual aba 19
  await dumpSheet(
    'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI ZONA SUL-MANUAL.xlsx',
    '19',
    `${OUT}/2-kpi-manual.md`,
    'KPI MANUAL ZS dia 19',
    10,
  )

  // 3. Escala ZS dia 19 (aba MATRIZ tem todos os dias)
  await dumpSheet(
    'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/ESCALA ZONA SUL - MAIO (6).xlsx',
    'MATRIZ',
    `${OUT}/3-escala-completa.md`,
    'ESCALA ZS Maio completa (aba MATRIZ)',
    22,
  )

  // 4. GPS Unitrac xlsx
  await dumpSheet(
    'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/relatorio_9391.xlsx',
    undefined,
    `${OUT}/4-unitrac-xlsx.md`,
    'GPS Unitrac dia 19 (xlsx)',
    15,
  )

  console.log('\nDumps prontos em', OUT)
})()
