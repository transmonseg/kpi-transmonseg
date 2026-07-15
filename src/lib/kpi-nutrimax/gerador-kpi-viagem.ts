import ExcelJS from 'exceljs'
import { getLogoBuffer } from '@/lib/kpi/template-loader'
import type { KpiViagemNutrimax } from './types'

// Mesmas cores do template aprovado do KPI Benassi.
const COR_TITULO = 'FF153C6B'
const COR_HEADER_TABELA = 'FF2E75B6'
const COR_BG_ALT = 'FFF8FAFC'
const COR_OK_BG = 'FFD1FAE5'
const COR_OK_TXT = 'FF065F46'
const COR_INCOMPLETO_BG = 'FFFEF3C7'
const COR_INCOMPLETO_TXT = 'FF92400E'
const COR_SEM_RASTREADOR_BG = 'FFFEE2E2'
const COR_SEM_RASTREADOR_TXT = 'FF991B1B'

const STATUS_LABEL: Record<KpiViagemNutrimax['status'], string> = {
  ok: 'OK',
  incompleto: 'INCOMPLETO',
  sem_rastreador: 'SEM RASTREADOR',
}

const STATUS_COR: Record<KpiViagemNutrimax['status'], { bg: string; txt: string }> = {
  ok: { bg: COR_OK_BG, txt: COR_OK_TXT },
  incompleto: { bg: COR_INCOMPLETO_BG, txt: COR_INCOMPLETO_TXT },
  sem_rastreador: { bg: COR_SEM_RASTREADOR_BG, txt: COR_SEM_RASTREADOR_TXT },
}

const COLUNAS = [
  'CARGA', 'PLACA', 'DESTINO', 'MOTORISTA', 'PESO (KG)', 'CLIENTES PLANEJADOS',
  'PARADAS REAIS', 'KM PERCORRIDO', 'INÍCIO VIAGEM', 'FIM VIAGEM', 'STATUS',
] as const

export async function gerarKpiViagemXlsx(kpi: KpiViagemNutrimax[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()

  const logoBuf = await getLogoBuffer()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageId = wb.addImage({ buffer: logoBuf as any, extension: 'png' })

  const ws = wb.addWorksheet('KPI Nutry Max')
  ws.columns = [
    { width: 10 }, { width: 12 }, { width: 22 }, { width: 26 }, { width: 12 },
    { width: 14 }, { width: 12 }, { width: 13 }, { width: 20 }, { width: 20 }, { width: 16 },
  ]

  ws.mergeCells(1, 1, 1, COLUNAS.length)
  const titulo = ws.getCell(1, 1)
  titulo.value = 'KPI NUTRY MAX — POR CARGA/PLACA'
  titulo.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO } }
  titulo.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 34
  ws.addImage(imageId, { tl: { col: 0.05, row: 0.05 }, ext: { width: 60, height: 43 } })

  ws.mergeCells(2, 1, 2, COLUNAS.length)
  const subtitulo = ws.getCell(2, 1)
  subtitulo.value = `${kpi.length} carga(s) — planejado (Escala) x realizado (Relatório Parada e Serviço)`
  subtitulo.font = { italic: true, size: 10, color: { argb: 'FF475569' } }
  subtitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } }
  subtitulo.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18

  const header = ws.addRow([...COLUNAS])
  header.eachCell(cell => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER_TABELA } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  header.height = 22

  let pesoTotal = 0
  let kmTotal = 0
  kpi.forEach((k, i) => {
    pesoTotal += k.pesoKg ?? 0
    kmTotal += k.kmPercorrido ?? 0
    const row = ws.addRow([
      k.carga, k.placaNorm, k.destino, k.motorista, k.pesoKg ?? '',
      k.entPlanejado ?? '', k.qtdParadasReal, k.kmPercorrido ?? '',
      k.inicioViagem ?? '', k.fimViagem ?? '', STATUS_LABEL[k.status],
    ])
    if (i % 2 === 1) {
      row.eachCell((cell, col) => { if (col < COLUNAS.length) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } } })
    }
    const cor = STATUS_COR[k.status]
    const statusCell = row.getCell(COLUNAS.length)
    statusCell.font = { bold: true, size: 10, color: { argb: cor.txt } }
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor.bg } }
    statusCell.alignment = { horizontal: 'center' }
  })

  if (kpi.length > 0) {
    const totalRow = ws.addRow(['TOTAL', '', '', '', pesoTotal, '', '', Math.round(kmTotal * 10) / 10, '', '', ''])
    totalRow.font = { bold: true }
    totalRow.eachCell(cell => { cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } } })
  }

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
