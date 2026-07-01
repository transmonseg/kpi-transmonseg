import ExcelJS from 'exceljs'
import type { StatusManual } from './parse-kpi-manual'

/** Uma linha salva em kpi_manual_entradas, pronta pra virar planilha de novo. */
export interface EntradaManualRow {
  data: string
  loja: string
  placa: string | null
  motorista: string | null
  status: StatusManual
  saida_cd: string | null
  chd: string | null
  sai: string | null
  volta_base: string | null
}

const COR_HEADER = 'FF1F4E78'
const COR_BG_ALT = 'FFF8FAFC'
const COR_BORDER = 'FFE2E8F0'

const LABEL_STATUS: Record<StatusManual, string> = {
  entregue: '',
  nao_foi: 'NÃO FOI AO CLIENTE',
  sem_rastreador: 'SEM RASTREADOR',
  indefinido: '',
}

/**
 * Regenera a aba de UM dia a partir dos dados salvos em kpi_manual_entradas —
 * não depende do arquivo original (que não fica mais salvo no storage). Header
 * reconhecível pelo parseKpiManual (LOJA/MOTORISTA/PLACA/SAIDA/CHD/CHEGADA),
 * então o arquivo baixado pode ser reenviado sem perda caso precise.
 */
function montarAbaDia(wb: ExcelJS.Workbook, dia: string, linhas: EntradaManualRow[]) {
  const ws = wb.addWorksheet(dia)
  const temVoltaBase = linhas.some(l => l.volta_base != null)
  const headers = temVoltaBase
    ? ['LOJA', 'MOTORISTA', 'PLACA', 'SAÍDA CD', 'CHD', 'SAÍDA', 'CHEGADA CD']
    : ['LOJA', 'MOTORISTA', 'PLACA', 'SAÍDA CD', 'CHD', 'SAÍDA']
  ws.columns = headers.map((h, i) => ({ width: i === 0 ? 32 : 14 }))

  const headerRow = ws.getRow(1)
  headerRow.values = headers
  headerRow.height = 22
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  const borderThin = {
    top: { style: 'thin' as const, color: { argb: COR_BORDER } },
    left: { style: 'thin' as const, color: { argb: COR_BORDER } },
    bottom: { style: 'thin' as const, color: { argb: COR_BORDER } },
    right: { style: 'thin' as const, color: { argb: COR_BORDER } },
  }

  linhas.forEach((l, i) => {
    const row = ws.getRow(i + 2)
    const placaOuLegenda = LABEL_STATUS[l.status] || l.placa || ''
    const valores = [l.loja, l.motorista ?? '', placaOuLegenda, l.saida_cd ?? '', l.chd ?? '', l.sai ?? '']
    if (temVoltaBase) valores.push(l.volta_base ?? '')
    row.values = valores
    row.height = 18
    const bg = i % 2 === 1 ? COR_BG_ALT : null
    row.eachCell(cell => {
      cell.border = borderThin
      cell.font = { size: 10.5 }
      cell.alignment = { horizontal: 'left', vertical: 'middle' }
      if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    })
  })
}

/** Gera o XLSX de UM dia (modo "dia específico"). */
export async function gerarXlsxDia(rede: string, data: string, linhas: EntradaManualRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()
  montarAbaDia(wb, data.slice(8, 10), linhas)
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

/** Gera o XLSX do MÊS inteiro (uma aba por dia que teve dado). */
export async function gerarXlsxMes(rede: string, mes: string, porDia: Map<string, EntradaManualRow[]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()
  const dias = [...porDia.keys()].sort()
  for (const dataIso of dias) {
    montarAbaDia(wb, dataIso.slice(8, 10), porDia.get(dataIso)!)
  }
  if (wb.worksheets.length === 0) wb.addWorksheet('vazio').addRow(['Sem dados no mês'])
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
