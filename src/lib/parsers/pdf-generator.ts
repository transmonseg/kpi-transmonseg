import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { RotaCozinha } from './cozinha-parser'

const PAGE_W = 595.28 // A4 width in pt
const PAGE_H = 841.89 // A4 height in pt
const MARGIN_X = 40
const MARGIN_Y = 50

const COL_WIDTHS = [30, 200, 200, 90] // #, ROTA, MOTORISTA, PLACA — soma = 520

const HEADER_BG = rgb(0.18, 0.46, 0.71)
const HEADER_TXT = rgb(1, 1, 1)
const ALT_ROW_BG = rgb(0.95, 0.95, 0.95)
const BORDER = rgb(0.75, 0.75, 0.75)
const TITLE_COLOR = rgb(0.12, 0.31, 0.47)
const SUB_COLOR = rgb(0.33, 0.33, 0.33)
const FOOTER_COLOR = rgb(0.6, 0.6, 0.6)

export async function gerarPdf(
  rotas: RotaCozinha[],
  dataReferencia?: string
): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page = pdf.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN_Y

  // Título
  const title = 'ESCALA COZINHA INDUSTRIAL'
  const titleSize = 16
  const titleWidth = fontBold.widthOfTextAtSize(title, titleSize)
  page.drawText(title, {
    x: (PAGE_W - titleWidth) / 2,
    y,
    size: titleSize,
    font: fontBold,
    color: TITLE_COLOR,
  })
  y -= 22

  if (dataReferencia) {
    const sub = `Data: ${dataReferencia}`
    const subSize = 11
    const subWidth = font.widthOfTextAtSize(sub, subSize)
    page.drawText(sub, {
      x: (PAGE_W - subWidth) / 2,
      y,
      size: subSize,
      font,
      color: SUB_COLOR,
    })
    y -= 22
  } else {
    y -= 8
  }

  // Tabela
  const rowH = 22
  const headerH = 26
  const xStart = MARGIN_X

  const drawHeader = () => {
    page.drawRectangle({
      x: xStart,
      y: y - headerH,
      width: COL_WIDTHS.reduce((a, b) => a + b, 0),
      height: headerH,
      color: HEADER_BG,
    })
    let xCursor = xStart
    const labels = ['#', 'ROTA', 'MOTORISTA', 'PLACA']
    labels.forEach((label, idx) => {
      const w = COL_WIDTHS[idx]
      const labelWidth = fontBold.widthOfTextAtSize(label, 11)
      let cx = xCursor + 8
      if (idx === 0 || idx === 3) cx = xCursor + (w - labelWidth) / 2
      page.drawText(label, {
        x: cx,
        y: y - headerH + 8,
        size: 11,
        font: fontBold,
        color: HEADER_TXT,
      })
      xCursor += w
    })
    y -= headerH
  }

  drawHeader()

  const drawRowBorder = (rowY: number) => {
    page.drawLine({
      start: { x: xStart, y: rowY },
      end: {
        x: xStart + COL_WIDTHS.reduce((a, b) => a + b, 0),
        y: rowY,
      },
      thickness: 0.4,
      color: BORDER,
    })
  }

  rotas.forEach((r, i) => {
    // Quebra de página
    if (y - rowH < MARGIN_Y + 40) {
      page = pdf.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN_Y
      drawHeader()
    }

    if (i % 2 === 1) {
      page.drawRectangle({
        x: xStart,
        y: y - rowH,
        width: COL_WIDTHS.reduce((a, b) => a + b, 0),
        height: rowH,
        color: ALT_ROW_BG,
      })
    }

    const cells = [String(i + 1), r.rota, r.motorista, r.placa]
    let xCursor = xStart
    cells.forEach((cellText, idx) => {
      const w = COL_WIDTHS[idx]
      const textSize = 10
      const textWidth = font.widthOfTextAtSize(cellText, textSize)
      const maxWidth = w - 12
      let drawText = cellText
      if (textWidth > maxWidth) {
        // truncar
        let trim = cellText
        while (
          trim.length > 1 &&
          font.widthOfTextAtSize(trim + '…', textSize) > maxWidth
        ) {
          trim = trim.slice(0, -1)
        }
        drawText = trim + '…'
      }
      const dw = font.widthOfTextAtSize(drawText, textSize)
      let cx = xCursor + 6
      if (idx === 0 || idx === 3) cx = xCursor + (w - dw) / 2
      page.drawText(drawText, {
        x: cx,
        y: y - rowH + 7,
        size: textSize,
        font,
        color: rgb(0, 0, 0),
      })
      xCursor += w
    })

    drawRowBorder(y - rowH)
    y -= rowH
  })

  // Bordas verticais
  const tableTop =
    PAGE_H -
    MARGIN_Y -
    (dataReferencia ? 22 + 22 + 8 : 22 + 8) -
    headerH
  let xCursor = xStart
  for (let i = 0; i <= COL_WIDTHS.length; i++) {
    page.drawLine({
      start: { x: xCursor, y: tableTop + headerH },
      end: { x: xCursor, y },
      thickness: 0.4,
      color: BORDER,
    })
    if (i < COL_WIDTHS.length) xCursor += COL_WIDTHS[i]
  }

  // Footer
  y -= 20
  const footer = `TRANSMONSEG  ·  Total de rotas: ${rotas.length}  ·  Gerado em ${new Date().toLocaleString('pt-BR')}`
  const fw = font.widthOfTextAtSize(footer, 8)
  page.drawText(footer, {
    x: (PAGE_W - fw) / 2,
    y: Math.max(y, MARGIN_Y - 10),
    size: 8,
    font,
    color: FOOTER_COLOR,
  })

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}
