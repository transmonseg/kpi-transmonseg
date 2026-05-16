import ExcelJS from 'exceljs'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const TEMPLATE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/kpi-modelos/KPI PRINCESA.xlsx'
const OUT = 'src/assets/transmonseg-logo.png'

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(TEMPLATE)
const imgs = wb.model.media || []
console.log(`Imagens encontradas: ${imgs.length}`)
for (const [i, m] of imgs.entries()) {
  console.log(`  ${i}: type=${m.extension} ${m.buffer?.length ?? 0} bytes`)
}
if (imgs[0]) {
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, imgs[0].buffer)
  console.log(`OK → ${OUT} (${imgs[0].extension}, ${imgs[0].buffer.length} bytes)`)
}
