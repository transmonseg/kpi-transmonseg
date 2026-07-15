import ExcelJS from 'exceljs'
import type { EntradaNutrimax } from './types'

export const COLUNAS_KPI_NUTRIMAX = [
  'CARGA', 'DESTINO', 'PLACA', 'MOTORISTA', 'NF', 'CLIENTE', 'ENDEREÇO', 'STATUS', 'HORA REALIZADO',
  'PLACA RASTREADA', 'PLACA DUPLICADA',
] as const

export async function gerarKpiNutrimax(entradas: EntradaNutrimax[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('KPI Nutry Max')
  ws.addRow([...COLUNAS_KPI_NUTRIMAX])
  for (const e of entradas) {
    ws.addRow([
      e.carga, e.destino, e.placa, e.motorista ?? '', e.nf, e.cliente_nome,
      e.endereco ?? '', e.status, e.hora_realizado ?? '',
      e.placa_rastreada ? 'SIM' : 'NÃO', e.placa_duplicada ? 'SIM' : 'NÃO',
    ])
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
