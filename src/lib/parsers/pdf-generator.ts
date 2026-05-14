import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib'
import type { RotaCozinha, EstatisticasCozinha } from './cozinha-parser'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN_X = 36
const MARGIN_TOP = 40
const MARGIN_BOTTOM = 50

const COL_WIDTHS = [22, 152, 152, 70, 82, 45] // # | ROTA | MOTORISTA | PLACA | VEÍCULO | STATUS
const TABLE_WIDTH = COL_WIDTHS.reduce((a, b) => a + b, 0)

const C_BRAND_600 = rgb(0.122, 0.306, 0.471) // #1F4E78
const C_BRAND_500 = rgb(0.18, 0.46, 0.71) // #2E75B6
const C_BRAND_50 = rgb(0.941, 0.965, 0.984) // #F0F6FB
const C_ALT_ROW = rgb(0.973, 0.98, 0.988) // #F8FAFC
const C_BORDER = rgb(0.886, 0.91, 0.941) // #E2E8F0
const C_INK = rgb(0.06, 0.09, 0.16) // #0F172A
const C_INK_SOFT = rgb(0.278, 0.333, 0.412) // #475569
const C_MUTED = rgb(0.58, 0.64, 0.72) // #94A3B8
const C_WHITE = rgb(1, 1, 1)

// Status colors
const C_OK_BG = rgb(0.82, 0.98, 0.91)
const C_OK_TXT = rgb(0.024, 0.373, 0.275)
const C_WARN_BG = rgb(0.996, 0.953, 0.78)
const C_WARN_TXT = rgb(0.573, 0.251, 0.055)
const C_WARN_ROW = rgb(1, 0.945, 0.78)       // âmbar mais visível para linhas sem dados
const C_EMPTY_BG = rgb(0.996, 0.953, 0.635)  // #FEF3A2 amarelo mais visível
const C_EMPTY_TXT = rgb(0.48, 0.29, 0.0)     // #7A4A00 yellow-dark
const C_EMPTY_ROW = rgb(0.996, 0.965, 0.725) // #FEF5B9 amarelo linha

type StatusKey = RotaCozinha['status']

export async function gerarPdf(
  rotas: RotaCozinha[],
  estatisticas: EstatisticasCozinha,
  dataReferencia?: string
): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Escala Cozinha Industrial — TRANSMONSEG')
  pdf.setProducer('Sistema KPI TRANSMONSEG')

  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page = pdf.addPage([PAGE_W, PAGE_H])
  let y = drawCabecalho(page, fontBold, font, dataReferencia, estatisticas)

  // Tabela
  const rowH = 21
  const headerH = 26
  const xStart = MARGIN_X

  y -= 8
  y = drawHeader(page, fontBold, xStart, y, headerH)

  let tableTop = y
  let pageNum = 1
  const totalPages = computeTotalPages(rotas.length, y, rowH, headerH)

  rotas.forEach((r, i) => {
    if (y - rowH < MARGIN_BOTTOM + 25) {
      drawTableBorders(page, xStart, tableTop, y)
      drawRodape(page, font, pageNum, totalPages, estatisticas.total)
      page = pdf.addPage([PAGE_W, PAGE_H])
      pageNum++
      y = drawCabecalhoContinuacao(page, fontBold)
      y = drawHeader(page, fontBold, xStart, y, headerH)
      tableTop = y
    }

    drawRow(page, font, fontBold, xStart, y, rowH, i, r)
    y -= rowH
  })

  drawTableBorders(page, xStart, tableTop, y)
  drawRodape(page, font, pageNum, totalPages, estatisticas.total)

  return Buffer.from(await pdf.save())
}

function drawCabecalho(
  page: PDFPage,
  fontBold: PDFFont,
  font: PDFFont,
  dataReferencia: string | undefined,
  est: EstatisticasCozinha
): number {
  let y = PAGE_H - MARGIN_TOP

  // Barra superior brand
  page.drawRectangle({
    x: 0,
    y: y - 6,
    width: PAGE_W,
    height: 6,
    color: C_BRAND_600,
  })

  // Logo + título
  const titleSize = 18
  const title = 'ESCALA COZINHA INDUSTRIAL'
  const titleW = fontBold.widthOfTextAtSize(title, titleSize)
  page.drawText(title, {
    x: (PAGE_W - titleW) / 2,
    y: y - 32,
    size: titleSize,
    font: fontBold,
    color: C_BRAND_600,
  })

  const brand = 'TRANSMONSEG'
  const brandSize = 9
  const brandW = fontBold.widthOfTextAtSize(brand, brandSize)
  page.drawText(brand, {
    x: (PAGE_W - brandW) / 2,
    y: y - 47,
    size: brandSize,
    font: fontBold,
    color: C_INK_SOFT,
  })

  y -= 70

  if (dataReferencia) {
    const sub = `Data de referência: ${dataReferencia}`
    const subSize = 10
    const subW = font.widthOfTextAtSize(sub, subSize)
    page.drawText(sub, {
      x: (PAGE_W - subW) / 2,
      y,
      size: subSize,
      font,
      color: C_INK_SOFT,
    })
    y -= 18
  }

  // Caixa de estatísticas
  const statBoxH = 32
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

  const stats: { label: string; valor: string; cor: ReturnType<typeof rgb> }[] = [
    { label: 'TOTAL', valor: String(est.total), cor: C_BRAND_600 },
    { label: 'COMPLETAS', valor: String(est.completas), cor: C_OK_TXT },
    { label: 'SEM PLACA', valor: String(est.semPlaca), cor: C_WARN_TXT },
    { label: 'VAZIAS', valor: String(est.vazias), cor: C_EMPTY_TXT },
    {
      label: 'DUPLICADAS',
      valor: String(est.duplicadas),
      cor: est.duplicadas > 0 ? C_WARN_TXT : C_MUTED,
    },
  ]

  const innerW = PAGE_W - MARGIN_X * 2
  const cellW = innerW / stats.length
  stats.forEach((s, i) => {
    const cx = MARGIN_X + i * cellW + cellW / 2

    const valSize = 13
    const valW = fontBold.widthOfTextAtSize(s.valor, valSize)
    page.drawText(s.valor, {
      x: cx - valW / 2,
      y: statBoxY + 14,
      size: valSize,
      font: fontBold,
      color: s.cor,
    })

    const labSize = 7
    const labW = fontBold.widthOfTextAtSize(s.label, labSize)
    page.drawText(s.label, {
      x: cx - labW / 2,
      y: statBoxY + 4,
      size: labSize,
      font: fontBold,
      color: C_INK_SOFT,
    })

    if (i < stats.length - 1) {
      page.drawLine({
        start: { x: MARGIN_X + (i + 1) * cellW, y: statBoxY + 6 },
        end: { x: MARGIN_X + (i + 1) * cellW, y: statBoxY + statBoxH - 6 },
        thickness: 0.5,
        color: C_BORDER,
      })
    }
  })

  y = statBoxY
  return y
}

function drawCabecalhoContinuacao(page: PDFPage, fontBold: PDFFont): number {
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 6,
    width: PAGE_W,
    height: 6,
    color: C_BRAND_600,
  })

  const t = 'ESCALA COZINHA INDUSTRIAL (continuação)'
  const tSize = 12
  const tW = fontBold.widthOfTextAtSize(t, tSize)
  page.drawText(t, {
    x: (PAGE_W - tW) / 2,
    y: PAGE_H - MARGIN_TOP - 5,
    size: tSize,
    font: fontBold,
    color: C_BRAND_600,
  })

  return PAGE_H - MARGIN_TOP - 25
}

function drawHeader(
  page: PDFPage,
  fontBold: PDFFont,
  xStart: number,
  y: number,
  h: number
): number {
  page.drawRectangle({
    x: xStart,
    y: y - h,
    width: TABLE_WIDTH,
    height: h,
    color: C_BRAND_500,
  })

  const labels = ['#', 'ROTA', 'MOTORISTA', 'PLACA', 'VEÍCULO', 'STATUS']
  let cx = xStart
  labels.forEach((label, idx) => {
    const w = COL_WIDTHS[idx]
    const size = 10
    const tw = fontBold.widthOfTextAtSize(label, size)
    const center = idx === 0 || idx === 3 || idx === 4 || idx === 5
    const x = center ? cx + (w - tw) / 2 : cx + 8
    page.drawText(label, {
      x,
      y: y - h + 9,
      size,
      font: fontBold,
      color: C_WHITE,
    })
    cx += w
  })

  return y - h
}

function drawRow(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  xStart: number,
  y: number,
  h: number,
  i: number,
  r: RotaCozinha
) {
  // Status-aware row background
  let rowBg: ReturnType<typeof rgb> | null = null
  if (r.status === 'vazia') {
    rowBg = C_EMPTY_ROW
  } else if (r.status === 'sem-placa' || r.status === 'sem-motorista') {
    rowBg = C_WARN_ROW
  } else if (i % 2 === 1) {
    rowBg = C_ALT_ROW
  }
  if (rowBg !== null) {
    page.drawRectangle({
      x: xStart,
      y: y - h,
      width: TABLE_WIDTH,
      height: h,
      color: rowBg,
    })
  }

  const valores = [String(i + 1), r.rota, r.motorista, r.placa, r.veiculo]
  let cx = xStart
  valores.forEach((txt, idx) => {
    const w = COL_WIDTHS[idx]
    const size = 9.5
    const tw = font.widthOfTextAtSize(txt, size)
    const maxW = w - 12
    let drawText = txt
    if (tw > maxW) {
      let trim = txt
      while (
        trim.length > 1 &&
        font.widthOfTextAtSize(trim + '…', size) > maxW
      ) {
        trim = trim.slice(0, -1)
      }
      drawText = trim + '…'
    }
    const dw = font.widthOfTextAtSize(drawText, size)
    const center = idx === 0 || idx === 3 || idx === 4
    const x = center ? cx + (w - dw) / 2 : cx + 6
    page.drawText(drawText, {
      x,
      y: y - h + 7,
      size,
      font,
      color: txt === '—' ? C_MUTED : C_INK,
    })
    cx += w
  })

  // Status badge (6ª coluna)
  drawStatusBadge(page, fontBold, cx, y - h, COL_WIDTHS[5], h, r.status)

  // Linha de baixo
  page.drawLine({
    start: { x: xStart, y: y - h },
    end: { x: xStart + TABLE_WIDTH, y: y - h },
    thickness: 0.3,
    color: C_BORDER,
  })
}

function drawStatusBadge(
  page: PDFPage,
  fontBold: PDFFont,
  x: number,
  y: number,
  w: number,
  h: number,
  status: StatusKey
) {
  const { bg, txt, label } = badgeConfig(status)
  const badgeW = w - 8  // usa quase toda a largura da coluna
  const badgeH = 13
  const bx = x + (w - badgeW) / 2
  const by = y + (h - badgeH) / 2

  page.drawRectangle({
    x: bx,
    y: by,
    width: badgeW,
    height: badgeH,
    color: bg,
  })

  const size = 7.5
  const tw = fontBold.widthOfTextAtSize(label, size)
  page.drawText(label, {
    x: bx + (badgeW - tw) / 2,
    y: by + 3.5,
    size,
    font: fontBold,
    color: txt,
  })
}

function badgeConfig(s: StatusKey): {
  bg: ReturnType<typeof rgb>
  txt: ReturnType<typeof rgb>
  label: string
} {
  switch (s) {
    case 'completa':
      return { bg: C_OK_BG, txt: C_OK_TXT, label: 'OK' }
    case 'sem-placa':
      return { bg: C_WARN_BG, txt: C_WARN_TXT, label: 'S/PLACA' }
    case 'sem-motorista':
      return { bg: C_WARN_BG, txt: C_WARN_TXT, label: 'S/MOT.' }
    case 'vazia':
      return { bg: C_EMPTY_BG, txt: C_EMPTY_TXT, label: 'VAZIA' }
  }
}

function drawTableBorders(
  page: PDFPage,
  xStart: number,
  topY: number,
  bottomY: number
) {
  let cx = xStart
  for (let i = 0; i <= COL_WIDTHS.length; i++) {
    page.drawLine({
      start: { x: cx, y: topY },
      end: { x: cx, y: bottomY },
      thickness: 0.4,
      color: C_BORDER,
    })
    if (i < COL_WIDTHS.length) cx += COL_WIDTHS[i]
  }
}

function drawRodape(
  page: PDFPage,
  font: PDFFont,
  pageNum: number,
  totalPages: number,
  totalRotas: number
) {
  const txt = `TRANSMONSEG  ·  ${totalRotas} rotas  ·  Página ${pageNum} de ${totalPages}  ·  Gerado em ${new Date().toLocaleString('pt-BR')}`
  const size = 8
  const tw = font.widthOfTextAtSize(txt, size)
  page.drawText(txt, {
    x: (PAGE_W - tw) / 2,
    y: MARGIN_BOTTOM - 25,
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
  const firstPageRows = Math.floor((firstY - MARGIN_BOTTOM - 25) / rowH)
  if (firstPageRows >= totalRows) return 1
  const remaining = totalRows - firstPageRows
  const nextPageMaxY = PAGE_H - MARGIN_TOP - 25 - headerH
  const rowsPerNextPage = Math.floor((nextPageMaxY - MARGIN_BOTTOM - 25) / rowH)
  return 1 + Math.ceil(remaining / rowsPerNextPage)
}
