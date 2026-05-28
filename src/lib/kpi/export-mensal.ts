import ExcelJS from 'exceljs'
import type { EntradaManual } from './parse-kpi-manual'

/**
 * Monta um XLSX mensal de UMA rede: uma aba por dia do mês, cada aba listando
 * as lojas com placa, motorista, horários e status. `mes` no formato YYYY-MM.
 */
export async function montarXlsxMensal(rede_id: string, mes: string, ents: EntradaManual[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const doMes = ents.filter(e => e.data.startsWith(mes) && e.rede_id === rede_id)
  const dias = [...new Set(doMes.map(e => e.data))].sort()
  for (const dia of dias) {
    const ws = wb.addWorksheet(dia.slice(8, 10))
    ws.addRow(['LOJA', 'PLACA', 'MOTORISTA', 'SAIDA CD', 'CHD LOJA', 'SAIDA LOJA', 'STATUS'])
    for (const e of doMes.filter(x => x.data === dia)) {
      ws.addRow([e.loja, e.placa ?? '', e.motorista ?? '', e.saida_cd ?? '', e.chd ?? '', e.sai ?? '', e.status])
    }
  }
  if (dias.length === 0) wb.addWorksheet('vazio').addRow(['Sem dados no mês'])
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
