import ExcelJS from 'exceljs'
import type { EntradaNutrimax } from './types'

const STATUS_VALIDOS: EntradaNutrimax['status'][] = ['entregue', 'pendente', 'confirmado_indireto']

export async function parseKpiNutrimaxXlsx(buffer: Buffer, data: string): Promise<EntradaNutrimax[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return []

  const header = (ws.getRow(1).values as unknown[]).map(v => String(v ?? '').trim().toUpperCase())
  const idx = (nome: string) => header.indexOf(nome)
  const iCarga = idx('CARGA')
  const iDestino = idx('DESTINO')
  const iPlaca = idx('PLACA')
  const iMotorista = idx('MOTORISTA')
  const iNf = idx('NF')
  const iCliente = idx('CLIENTE')
  const iEndereco = idx('ENDEREÇO')
  const iStatus = idx('STATUS')
  const iHora = idx('HORA REALIZADO')
  const iRastreada = idx('PLACA RASTREADA')
  const iDuplicada = idx('PLACA DUPLICADA')

  const entradas: EntradaNutrimax[] = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const vals = row.values as unknown[]
    const nf = String(vals[iNf] ?? '').trim()
    if (!nf) return
    const hora = String(vals[iHora] ?? '').trim()
    const statusRaw = String(vals[iStatus] ?? '').trim()
    entradas.push({
      data,
      carga: String(vals[iCarga] ?? '').trim(),
      destino: String(vals[iDestino] ?? '').trim(),
      placa: String(vals[iPlaca] ?? '').trim(),
      motorista: String(vals[iMotorista] ?? '').trim() || null,
      nf,
      cliente_codigo: null,
      cliente_nome: String(vals[iCliente] ?? '').trim(),
      endereco: String(vals[iEndereco] ?? '').trim() || null,
      status: STATUS_VALIDOS.includes(statusRaw as EntradaNutrimax['status']) ? statusRaw as EntradaNutrimax['status'] : 'pendente',
      hora_realizado: hora || null,
      // Colunas novas — planilha antiga sem elas assume "sem sinal/sem duplicidade"
      // em vez de quebrar a releitura.
      placa_rastreada: iRastreada >= 0 ? String(vals[iRastreada] ?? '').trim().toUpperCase() === 'SIM' : true,
      placa_duplicada: iDuplicada >= 0 ? String(vals[iDuplicada] ?? '').trim().toUpperCase() === 'SIM' : false,
    })
  })
  return entradas
}
