import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'

const MANUAL = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI-ARMAZEM_GRAO-MANUAL.xlsx'

const wb = XLSX.read(readFileSync(MANUAL), { type: 'buffer', cellDates: true })
const ws = wb.Sheets['21.05']
// Lê células direto pra ver formato/valor numérico
const range = XLSX.utils.decode_range(ws['!ref']!)
for (let R = 0; R <= range.e.r; ++R) {
  const linha: string[] = []
  for (let C = 0; C <= range.e.c; ++C) {
    const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
    if (!cell) { linha.push(''); continue }
    // Mostra valor + tipo
    linha.push(`${cell.v ?? ''}(t=${cell.t})`)
  }
  if (linha.every(c => c === '' || c === '(t=undefined)')) continue
  console.log(`L${String(R).padStart(2,'0')}: ${linha.slice(0, 8).join(' | ')}`)
}
