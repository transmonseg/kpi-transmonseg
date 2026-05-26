import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'

const A = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI-ARMAZEM_GRAO-MANUAL.xlsx'
const B = 'C:/Users/media/Downloads/KPI ARMAZEM DO GRAO.xlsx'

const wbA = XLSX.read(readFileSync(A), { type: 'buffer' })
console.log('INTENSIVA abas:', wbA.SheetNames)
const wbB = XLSX.read(readFileSync(B), { type: 'buffer' })
console.log('Downloads abas:', wbB.SheetNames)
