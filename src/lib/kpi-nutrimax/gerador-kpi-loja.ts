import ExcelJS from 'exceljs'
import { getLogoBuffer } from '@/lib/kpi/template-loader'
import { formataDataPtBr } from '@/lib/kpi/kpi-styles'
import type { LinhaKpiLojaNutrimax } from './types'

const COR_TITULO = 'FF153C6B'
const COR_HEADER_TABELA = 'FF2E75B6'
const COR_BG_ALT = 'FFF8FAFC'
const COR_CONFIRMADO_BG = 'FFD1FAE5'
const COR_CONFIRMADO_TXT = 'FF065F46'
const COR_PENDENTE_BG = 'FFFEF3C7'
const COR_PENDENTE_TXT = 'FF92400E'
const COR_SEM_RASTREADOR_BG = 'FFFEE2E2'
const COR_SEM_RASTREADOR_TXT = 'FF991B1B'

const STATUS_LABEL: Record<LinhaKpiLojaNutrimax['status'], string> = {
  confirmado: 'CONFIRMADO',
  pendente: 'PENDENTE',
  sem_rastreador: 'SEM RASTREADOR',
}
const STATUS_COR: Record<LinhaKpiLojaNutrimax['status'], { bg: string; txt: string }> = {
  confirmado: { bg: COR_CONFIRMADO_BG, txt: COR_CONFIRMADO_TXT },
  pendente: { bg: COR_PENDENTE_BG, txt: COR_PENDENTE_TXT },
  sem_rastreador: { bg: COR_SEM_RASTREADOR_BG, txt: COR_SEM_RASTREADOR_TXT },
}

const COLUNAS = [
  'LOJA', 'MOTORISTA', 'PLACA', 'SAÍDA DA BASE', 'CHEGADA NA LOJA', 'SAÍDA DA LOJA',
  'TEMPO NA LOJA', 'CHEGADA NA BASE', 'TEMPO TOTAL DA OPERAÇÃO', 'KM', 'STATUS',
] as const
const COL_SAIDA_BASE = 4
const COL_CHEGADA_LOJA = 5
const COL_SAIDA_LOJA = 6
const COL_TEMPO_LOJA = 7
const COL_CHEGADA_BASE = 8
const COL_TEMPO_OPERACAO = 9

function toExcelTime(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  return (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400
}

function minutosParaFracaoDia(min: number | null): number | null {
  return min == null ? null : min / 1440
}

export async function gerarKpiLojaXlsx(linhas: LinhaKpiLojaNutrimax[], data: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()

  const logoBuf = await getLogoBuffer()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageId = wb.addImage({ buffer: logoBuf as any, extension: 'png' })

  const [, mesIso, diaIso] = data.split('-')
  const ws = wb.addWorksheet(`${diaIso}.${mesIso}`)
  ws.columns = [
    { width: 34 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 13 },
    { width: 12 }, { width: 13 }, { width: 16 }, { width: 10 }, { width: 16 },
  ]

  ws.mergeCells(1, 1, 1, COLUNAS.length)
  const titulo = ws.getCell(1, 1)
  titulo.value = 'RELATÓRIO KPI - NUTRY MAX'
  titulo.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO } }
  titulo.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 34
  ws.addImage(imageId, { tl: { col: 0.05, row: 0.05 }, ext: { width: 60, height: 43 } })

  ws.mergeCells(2, 1, 2, COLUNAS.length)
  const subtitulo = ws.getCell(2, 1)
  subtitulo.value = `${formataDataPtBr(data)} — ${linhas.length} loja(s) — via API Unitrac`
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

  let kmTotal = 0
  const kmJaContado = new Set<string>()
  linhas.forEach((l, i) => {
    // km é total por placa (repetido em cada linha da mesma placa) — só soma 1x.
    if (l.kmPercorrido != null && !kmJaContado.has(l.placaNorm)) {
      kmTotal += l.kmPercorrido
      kmJaContado.add(l.placaNorm)
    }
    const row = ws.addRow([
      l.loja, l.motorista, l.placaNorm,
      toExcelTime(l.saidaBase) ?? '', toExcelTime(l.chegadaLoja) ?? '', toExcelTime(l.saidaLoja) ?? '',
      minutosParaFracaoDia(l.tempoNaLojaMin) ?? '', toExcelTime(l.chegadaBase) ?? '',
      minutosParaFracaoDia(l.tempoOperacaoMin) ?? '', l.kmPercorrido ?? '', STATUS_LABEL[l.status],
    ])
    if (i % 2 === 1) {
      row.eachCell((cell, col) => { if (col < COLUNAS.length) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } } })
    }
    for (const col of [COL_SAIDA_BASE, COL_CHEGADA_LOJA, COL_SAIDA_LOJA, COL_TEMPO_LOJA, COL_CHEGADA_BASE, COL_TEMPO_OPERACAO]) {
      const cell = row.getCell(col)
      if (typeof cell.value === 'number') { cell.numFmt = 'h:mm'; cell.alignment = { horizontal: 'center' } }
    }
    const cor = STATUS_COR[l.status]
    const statusCell = row.getCell(COLUNAS.length)
    statusCell.font = { bold: true, size: 10, color: { argb: cor.txt } }
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor.bg } }
    statusCell.alignment = { horizontal: 'center' }
  })

  if (linhas.length > 0) {
    const totalRow = ws.addRow(['TOTAL', '', '', '', '', '', '', '', '', Math.round(kmTotal * 10) / 10, ''])
    totalRow.font = { bold: true }
    totalRow.eachCell(cell => { cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } } })
  }

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
