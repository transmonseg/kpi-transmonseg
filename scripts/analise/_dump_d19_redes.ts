/**
 * Dump puro de cada rede dia 19 (gerado + manual aba 19).
 * NÃO compara — apenas extrai pra MD legível.
 *
 * Output: docs/auditoria/dia-19-todas-redes/dumps/
 */
import ExcelJS from 'exceljs'
import { writeFileSync, mkdirSync } from 'fs'

const OUT = 'docs/auditoria/dia-19-todas-redes/dumps'
mkdirSync(OUT, { recursive: true })

const MAN_DIR = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA'
const DOWNLOADS = 'C:/Users/media/Downloads'

const REDES: Array<{ id: string; gerado: string; manual: string; sheet: string }> = [
  { id: 'ASSAI',        gerado: 'KPI-ASSAI-2026-05-19 (3).xlsx',        manual: 'KPI-ASSAI-MANUAL.xlsx',        sheet: '19' },
  { id: 'ATACADAO',     gerado: 'KPI-ATACADAO-2026-05-19 (4).xlsx',     manual: 'KPI-ATACADAO-MANUAL.xlsx',     sheet: '19' },
  { id: 'CARREFOUR',    gerado: 'KPI-CARREFOUR-2026-05-19 (3).xlsx',    manual: 'KPI-CARREFOUR-MANUAL.xlsx',    sheet: '19' },
  { id: 'GUANABARA',    gerado: 'KPI-GUANABARA-2026-05-19 (7).xlsx',    manual: 'KPI-GUANABARA-MANUAL.xlsx',    sheet: '19' },
  { id: 'PREZUNIC',     gerado: 'KPI-PREZUNIC-2026-05-19 (3).xlsx',     manual: 'KPI-PREZUNIC-MANUAL.xlsx',     sheet: '19' },
  { id: 'PRINCESA',     gerado: 'KPI-PRINCESA-2026-05-19 (10).xlsx',    manual: 'KPI-PRINCESA-MANUAL.xlsx',     sheet: '19' },
  { id: 'SUPERPRIX',    gerado: 'KPI-SUPERPRIX-2026-05-19 (3).xlsx',    manual: 'KPI-SUPERPRIX-MANUAL.xlsx',    sheet: '19' },
  { id: 'ARMAZEM_GRAO', gerado: 'KPI-ARMAZEM_GRAO-2026-05-19 (8).xlsx', manual: 'KPI-ARMAZEM_GRAO-MANUAL.xlsx', sheet: '19' },
]

function cell(c: ExcelJS.Cell | undefined): string {
  if (!c) return ''
  const v = c.value
  if (v == null) return ''
  if (v instanceof Date) {
    const h = v.getUTCHours()
    const m = v.getUTCMinutes()
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (typeof v === 'object' && 'result' in v) {
    const r = (v as any).result
    if (r instanceof Date) return `${String(r.getUTCHours()).padStart(2, '0')}:${String(r.getUTCMinutes()).padStart(2, '0')}`
    return String(r ?? '')
  }
  if (typeof v === 'object' && 'text' in v) return String((v as any).text)
  if (typeof v === 'object' && 'richText' in v) return (v as any).richText.map((r: any) => r.text).join('')
  return String(v).trim()
}

async function dumpSheet(path: string, sheetName: string | undefined, outFile: string, title: string, maxCols = 12, colWidth = 20) {
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(path)
    const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0]
    if (!ws) { writeFileSync(outFile, `# ${title}\n\nABA "${sheetName}" não encontrada\n\nDisponível: ${wb.worksheets.map(w => w.name).join(', ')}\n`); return }

    let out = `# ${title}\n\n`
    out += `Arquivo: \`${path}\`\n`
    out += `Aba: \`${ws.name}\` (${ws.rowCount}r × ${ws.columnCount}c)\n\n`
    out += '```\n'
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const cells: string[] = []
      for (let c = 1; c <= Math.min(maxCols, ws.columnCount); c++) {
        cells.push(cell(row.getCell(c)).slice(0, colWidth).padEnd(colWidth))
      }
      // Pula linhas completamente vazias
      const conteudo = cells.join('').trim()
      if (!conteudo) continue
      out += `R${String(r).padStart(3)}: ${cells.join('|')}\n`
    }
    out += '```\n'
    writeFileSync(outFile, out)
    console.log(`✓ ${outFile}`)
  } catch (e: any) {
    writeFileSync(outFile, `# ${title}\n\nErro: ${e.message}\n`)
    console.log(`✗ ${outFile}: ${e.message}`)
  }
}

;(async () => {
  for (const rede of REDES) {
    await dumpSheet(
      `${DOWNLOADS}/${rede.gerado}`,
      undefined,
      `${OUT}/${rede.id.toLowerCase()}-gerado.md`,
      `${rede.id} GERADO dia 19`,
      10,
    )
    await dumpSheet(
      `${MAN_DIR}/${rede.manual}`,
      rede.sheet,
      `${OUT}/${rede.id.toLowerCase()}-manual.md`,
      `${rede.id} MANUAL dia 19`,
      10,
    )
  }
  console.log('\nDumps prontos em', OUT)
})()
