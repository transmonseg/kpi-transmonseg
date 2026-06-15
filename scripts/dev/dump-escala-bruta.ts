// Dump cru da planilha de carregamento pra entender o layout de 1º/2º carro.
// Uso: npx tsx scripts/dev/dump-escala-bruta.ts
import ExcelJS from 'exceljs'

const ESCALA = 'C:/Users/media/Downloads/ESCALA-HOJE-auto_1780231342372.xlsx'
const FILIAIS_FOCO = new Set([21, 30, 33, 45, 7, 11, 4, 18])

const txt = (v: ExcelJS.CellValue): string => {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(11, 16)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('text' in o) return String(o.text)
    if ('result' in o) return String(o.result)
    if ('richText' in o) return (o.richText as { text: string }[]).map(r => r.text).join('')
  }
  return String(v)
}

async function main() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(ESCALA)
  const ws = wb.worksheets[0]
  console.log(`Aba: ${ws.name}  linhas: ${ws.rowCount}  cols: ${ws.columnCount}\n`)

  // Cabeçalho (linha 1) pra entender as colunas
  console.log('LINHA 1 (cabeçalho?):')
  for (let c = 1; c <= 20; c++) {
    const v = txt(ws.getRow(1).getCell(c).value)
    if (v) console.log(`   col${c}: "${v}"`)
  }
  console.log('')

  // Dump das linhas das filiais foco — todas as colunas com conteúdo
  ws.eachRow((row, n) => {
    // tenta achar a filial: col3 (compacto) costuma ser número
    const c3 = ws.getRow(n).getCell(3).value
    const filial = typeof c3 === 'number' ? Math.round(c3) : Number(txt(c3))
    if (!FILIAIS_FOCO.has(filial)) return
    const cols: string[] = []
    for (let c = 1; c <= 16; c++) {
      const v = txt(row.getCell(c).value)
      if (v) cols.push(`c${c}=${v}`)
    }
    console.log(`L${n} fil=${filial}: ${cols.join('  ')}`)
  })
}
main().catch(e => { console.error(e); process.exit(1) })
