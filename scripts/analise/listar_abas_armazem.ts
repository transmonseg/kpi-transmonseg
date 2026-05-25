import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'
const wb = XLSX.read(readFileSync('C:/Users/media/Downloads/KPI ARMAZEM DO GRAO.xlsx'), { type: 'buffer' })
console.log('Abas:', wb.SheetNames)
