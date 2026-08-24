import ExcelJS from 'exceljs'
import type { LinhaKpiPortefrio } from './types'

export const COLUNAS_KPI_PORTEFRIO = [
  'PLACA', 'ORDEM PLANEJADA', 'ORDEM REAL', 'CLIENTE', 'ENDEREÇO', 'VISITADO',
  'HORÁRIO CHEGADA', 'TEMP MÍN (°C)', 'TEMP MÁX (°C)', 'TEMP MÉDIA (°C)',
] as const

function formatarHora(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

function formatarTemp(t: number | null): string | number {
  return t == null ? '' : Math.round(t * 10) / 10
}

export async function gerarKpiPortefrioXlsx(linhas: LinhaKpiPortefrio[], data: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()
  const ws = wb.addWorksheet(`KPI ${data}`)
  ws.addRow([...COLUNAS_KPI_PORTEFRIO])
  for (const l of linhas) {
    ws.addRow([
      l.placa, l.ordemPlanejada, l.ordemReal ?? '', l.cliente, l.endereco,
      l.visitado ? 'Sim' : 'Não', formatarHora(l.horarioChegada),
      formatarTemp(l.tempMin), formatarTemp(l.tempMax), formatarTemp(l.tempMedia),
    ])
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
