import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib'
import type { KpiLinha } from '@/lib/types/kpi'

// Landscape A4
const PAGE_W = 841.89
const PAGE_H = 595.28
const MARGIN_X = 30
const MARGIN_TOP = 36
const MARGIN_BOTTOM = 40

const C_BRAND_600 = rgb(0.122, 0.306, 0.471)
const C_BRAND_500 = rgb(0.18, 0.46, 0.71)
const C_BRAND_50 = rgb(0.941, 0.965, 0.984)
const C_ALT_ROW = rgb(0.973, 0.98, 0.988)
const C_BORDER = rgb(0.886, 0.91, 0.941)
const C_INK = rgb(0.06, 0.09, 0.16)
const C_INK_SOFT = rgb(0.278, 0.333, 0.412)
const C_MUTED = rgb(0.58, 0.64, 0.72)
const C_WHITE = rgb(1, 1, 1)

const WINSANI_MAP: Record<string, string> = {
  '→': '>', '←': '<', '↑': '^', '↓': 'v',
  '⚠': '!', '·': '.', '…': '...',
  '’': "'", '‘': "'", '“': '"', '”': '"',
  '–': '-', '—': '-', '•': '*', '●': '*',
}
function safeText(s: string): string {
  return s.replace(/[^\x00-\xFF]/g, c => WINSANI_MAP[c] ?? '?')
}

function fmt(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function fmtData(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function maxLojas(linhas: KpiLinha[]): number {
  const max = linhas.reduce((acc, l) => {
    const count = [l.chd_loja_1, l.chd_loja_2, l.chd_loja_3].filter(Boolean).length
    return Math.max(acc, count)
  }, 0)
  return Math.min(Math.max(max, 1), 3)
}

function buildColWidths(nLojas: number): number[] {
  const maxW = PAGE_W - 2 * MARGIN_X
  const fixed = [120, 100, 52, 50]
  const lojaBlock = Array.from({ length: nLojas }, () => [55, 55, 48]).flat()
  const obs = [70]
  const raw = [...fixed, ...lojaBlock, ...obs]
  const total = raw.reduce((a, b) => a + b, 0)
  if (total <= maxW) return raw
  // Escala proporcional para caber na página
  const scale = maxW / total
  return raw.map(w => Math.max(Math.floor(w * scale), 1))
}

function buildHeaders(nLojas: number): string[] {
  const h = ['REDES/FILIAIS', 'MOTORISTA', 'PLACA', 'SAÍDA CD']
  for (let n = 1; n <= nLojas; n++) {
    h.push(`CHE.L${n}`, `SAÍ.L${n}`, `TEMPO${n}`)
  }
  h.push('OBS')
  return h
}

function rowValues(l: KpiLinha, nLojas: number): string[] {
  const vals = [safeText(l.loja_nome), safeText(l.motorista ?? '—'), l.placa ?? '—', fmt(l.saida_cd)]
  for (let n = 1; n <= nLojas; n++) {
    const chd = n === 1 ? l.chd_loja_1 : n === 2 ? l.chd_loja_2 : l.chd_loja_3
    const sai = n === 1 ? l.saida_loja_1 : n === 2 ? l.saida_loja_2 : l.saida_loja_3
    const tempo = n === 1 ? l.tempo_loja_1_min : n === 2 ? l.tempo_loja_2_min : l.tempo_loja_3_min
    vals.push(fmt(chd), fmt(sai), tempo !== null ? `${tempo}m` : '—')
  }
  vals.push(safeText(l.observacao ?? ''))
  return vals
}

export async function gerarKpiPdf(params: {
  rede_id: string
  rede_nome: string
  data: string
  linhas: KpiLinha[]
}): Promise<Buffer> {
  const { rede_nome, data, linhas } = params
  const nLojas = maxLojas(linhas)
  const colWidths = buildColWidths(nLojas)
  const headers = buildHeaders(nLojas)
  const tableWidth = colWidths.reduce((a, b) => a + b, 0)

  const pdf = await PDFDocument.create()
  pdf.setTitle(`KPI ${rede_nome} — TRANSMONSEG`)
  pdf.setProducer('Sistema KPI TRANSMONSEG')

  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page = pdf.addPage([PAGE_W, PAGE_H])
  let y = drawCabecalho(page, fontBold, font, rede_nome, data, linhas.length)

  const rowH = 18
  const headerH = 22
  const xStart = MARGIN_X

  y -= 6
  y = drawTableHeader(page, fontBold, xStart, y, headerH, headers, colWidths, tableWidth)

  let tableTop = y
  let pageNum = 1
  const totalPages = computeTotalPages(linhas.length, y, rowH, headerH)

  linhas.forEach((l, i) => {
    if (y - rowH < MARGIN_BOTTOM + 20) {
      drawTableBorders(page, xStart, tableTop, y, colWidths)
      drawRodape(page, font, pageNum, totalPages, linhas.length, tableWidth)
      page = pdf.addPage([PAGE_W, PAGE_H])
      pageNum++
      y = drawContinuation(page, fontBold, rede_nome)
      y = drawTableHeader(page, fontBold, xStart, y, headerH, headers, colWidths, tableWidth)
      tableTop = y
    }

    drawRow(page, font, xStart, y, rowH, i, rowValues(l, nLojas), colWidths, tableWidth)
    y -= rowH
  })

  drawTableBorders(page, xStart, tableTop, y, colWidths)
  drawRodape(page, font, pageNum, totalPages, linhas.length, tableWidth)

  return Buffer.from(await pdf.save())
}

function drawCabecalho(
  page: PDFPage,
  fontBold: PDFFont,
  font: PDFFont,
  redeNome: string,
  data: string,
  totalLinhas: number
): number {
  let y = PAGE_H - MARGIN_TOP

  page.drawRectangle({ x: 0, y: y - 5, width: PAGE_W, height: 5, color: C_BRAND_600 })

  const title = `KPI - ${safeText(redeNome)}`
  const titleSize = 16
  const titleW = fontBold.widthOfTextAtSize(title, titleSize)
  page.drawText(title, {
    x: (PAGE_W - titleW) / 2,
    y: y - 26,
    size: titleSize,
    font: fontBold,
    color: C_BRAND_600,
  })

  const brandW = fontBold.widthOfTextAtSize('TRANSMONSEG', 9)
  page.drawText('TRANSMONSEG', {
    x: (PAGE_W - brandW) / 2,
    y: y - 40,
    size: 9,
    font: fontBold,
    color: C_INK_SOFT,
  })

  y -= 55

  const dateStr = fmtData(data)
  const subW = font.widthOfTextAtSize(dateStr, 10)
  page.drawText(dateStr, {
    x: (PAGE_W - subW) / 2,
    y,
    size: 10,
    font,
    color: C_INK_SOFT,
  })

  y -= 16

  const statBoxH = 28
  const statBoxY = y - statBoxH
  page.drawRectangle({
    x: MARGIN_X,
    y: statBoxY,
    width: PAGE_W - MARGIN_X * 2,
    height: statBoxH,
    color: C_BRAND_50,
    borderColor: C_BORDER,
    borderWidth: 0.5,
  })

  const totalLabel = 'TOTAL LINHAS'
  const totalVal = String(totalLinhas)
  const cx = PAGE_W / 2
  const valW = fontBold.widthOfTextAtSize(totalVal, 13)
  page.drawText(totalVal, { x: cx - valW / 2, y: statBoxY + 12, size: 13, font: fontBold, color: C_BRAND_600 })
  const labW = fontBold.widthOfTextAtSize(totalLabel, 7)
  page.drawText(totalLabel, { x: cx - labW / 2, y: statBoxY + 4, size: 7, font: fontBold, color: C_INK_SOFT })

  return statBoxY
}

function drawContinuation(page: PDFPage, fontBold: PDFFont, redeNome: string): number {
  page.drawRectangle({ x: 0, y: PAGE_H - 5, width: PAGE_W, height: 5, color: C_BRAND_600 })
  const t = `KPI - ${safeText(redeNome)} (continuacao)`
  const tSize = 11
  const tW = fontBold.widthOfTextAtSize(t, tSize)
  page.drawText(t, {
    x: (PAGE_W - tW) / 2,
    y: PAGE_H - MARGIN_TOP - 4,
    size: tSize,
    font: fontBold,
    color: C_BRAND_600,
  })
  return PAGE_H - MARGIN_TOP - 22
}

function drawTableHeader(
  page: PDFPage,
  fontBold: PDFFont,
  xStart: number,
  y: number,
  h: number,
  headers: string[],
  colWidths: number[],
  tableWidth: number
): number {
  page.drawRectangle({ x: xStart, y: y - h, width: tableWidth, height: h, color: C_BRAND_500 })

  let cx = xStart
  headers.forEach((label, idx) => {
    const w = colWidths[idx]
    const size = 8
    const tw = fontBold.widthOfTextAtSize(label, size)
    const x = cx + (w - tw) / 2
    page.drawText(label, { x, y: y - h + 8, size, font: fontBold, color: C_WHITE })
    cx += w
  })

  return y - h
}

function drawRow(
  page: PDFPage,
  font: PDFFont,
  xStart: number,
  y: number,
  h: number,
  i: number,
  values: string[],
  colWidths: number[],
  tableWidth: number
) {
  if (i % 2 === 1) {
    page.drawRectangle({ x: xStart, y: y - h, width: tableWidth, height: h, color: C_ALT_ROW })
  }

  let cx = xStart
  values.forEach((txt, idx) => {
    const w = colWidths[idx]
    const size = 8
    const maxW = w - 8
    let display = txt
    if (font.widthOfTextAtSize(display, size) > maxW) {
      while (display.length > 1 && font.widthOfTextAtSize(display + '…', size) > maxW) {
        display = display.slice(0, -1)
      }
      display = display + '…'
    }
    const tw = font.widthOfTextAtSize(display, size)
    const leftAlign = idx === 0 || idx === values.length - 1
    const x = leftAlign ? cx + 4 : cx + (w - tw) / 2
    page.drawText(display, {
      x,
      y: y - h + 6,
      size,
      font,
      color: txt === '—' ? C_MUTED : C_INK,
    })
    cx += w
  })

  page.drawLine({
    start: { x: xStart, y: y - h },
    end: { x: xStart + tableWidth, y: y - h },
    thickness: 0.3,
    color: C_BORDER,
  })
}

function drawTableBorders(
  page: PDFPage,
  xStart: number,
  topY: number,
  bottomY: number,
  colWidths: number[]
) {
  let cx = xStart
  for (let i = 0; i <= colWidths.length; i++) {
    page.drawLine({
      start: { x: cx, y: topY },
      end: { x: cx, y: bottomY },
      thickness: 0.4,
      color: C_BORDER,
    })
    if (i < colWidths.length) cx += colWidths[i]
  }
}

function drawRodape(
  page: PDFPage,
  font: PDFFont,
  pageNum: number,
  totalPages: number,
  totalLinhas: number,
  tableWidth: number
) {
  const txt = `TRANSMONSEG  ·  ${totalLinhas} linhas  ·  Página ${pageNum} de ${totalPages}  ·  Gerado em ${new Date().toLocaleString('pt-BR')}`
  const size = 7
  const tw = font.widthOfTextAtSize(txt, size)
  page.drawText(txt, {
    x: MARGIN_X + (tableWidth - tw) / 2,
    y: MARGIN_BOTTOM - 22,
    size,
    font,
    color: C_MUTED,
  })
}

function computeTotalPages(
  totalRows: number,
  firstY: number,
  rowH: number,
  headerH: number
): number {
  const firstPageRows = Math.floor((firstY - MARGIN_BOTTOM - 20) / rowH)
  if (firstPageRows >= totalRows) return 1
  const remaining = totalRows - firstPageRows
  const nextPageMaxY = PAGE_H - MARGIN_TOP - 22 - headerH
  const rowsPerNextPage = Math.floor((nextPageMaxY - MARGIN_BOTTOM - 20) / rowH)
  return 1 + Math.ceil(remaining / Math.max(rowsPerNextPage, 1))
}
