import * as XLSX from 'xlsx'
import { readFileSync } from 'fs'
const INTENSIVA = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/'
const files = ['KPI-ASSAI-MANUAL.xlsx','KPI-PREZUNIC-MANUAL.xlsx','KPI-PRINCESA-MANUAL.xlsx','KPI-GUANABARA-MANUAL.xlsx','KPI-SUPERPRIX-MANUAL.xlsx','KPI-CARREFOUR-MANUAL.xlsx','KPI-ATACADAO-MANUAL.xlsx','KPI ZONA SUL-MANUAL.xlsx','KPI-ARMAZEM_GRAO-MANUAL.xlsx']
for (const f of files) {
  const wb = XLSX.read(readFileSync(INTENSIVA+f), { type: 'buffer' })
  console.log(f + ': ' + wb.SheetNames.join(', '))
}
