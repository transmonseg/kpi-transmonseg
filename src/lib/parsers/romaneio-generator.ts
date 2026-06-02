import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib'
import type { RotaCozinha } from './cozinha-parser'
import { fmtInstanteBR } from '@/lib/data-br'

const COR_BRAND_600 = 'FF1F4E78'
const COR_BRAND_500 = 'FF2E75B6'
const COR_BRAND_50 = 'FFF0F6FB'
const COR_BORDER = 'FFE2E8F0'
const COR_BG_ALT = 'FFF8FAFC'
const COR_MUTED = 'FF94A3B8'

export async function gerarRomaneioXlsx(
  rotas: RotaCozinha[],
  dataReferencia?: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()

  // Aba resumo
  const wsResumo = wb.addWorksheet('RESUMO')
  wsResumo.columns = [
    { key: 'rota', width: 30 },
    { key: 'motorista', width: 26 },
    { key: 'placa', width: 13 },
    { key: 'veiculo', width: 20 },
    { key: 'clientes', width: 10 },
  ]

  wsResumo.mergeCells('A1:E1')
  const title = wsResumo.getCell('A1')
  title.value = 'ROMANEIO COZINHA INDUSTRIAL' + (dataReferencia ? `  —  ${dataReferencia}` : '')
  title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_600 } }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  wsResumo.getRow(1).height = 30

  const hdr = wsResumo.getRow(2)
  hdr.values = ['ROTA', 'MOTORISTA', 'PLACA', 'VEÍCULO', 'CLIENTES']
  hdr.height = 22
  hdr.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_500 } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  rotas.forEach((r, i) => {
    const row = wsResumo.getRow(3 + i)
    row.values = [r.rota, r.motorista, r.placa, r.veiculo, r.clientes.length]
    row.height = 18
    const bg = i % 2 === 1 ? COR_BG_ALT : null
    row.eachCell(cell => {
      if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.border = {
        bottom: { style: 'thin', color: { argb: COR_BORDER } },
        right: { style: 'thin', color: { argb: COR_BORDER } },
      }
      cell.alignment = { vertical: 'middle' }
      cell.font = { size: 10 }
    })
  })

  // Uma aba por rota — desambigua nomes duplicados
  const sheetCount = new Map<string, number>()
  for (const r of rotas) {
    const base = r.rota.slice(0, 28).replace(/[*?:/\\[\]]/g, '-')
    const count = (sheetCount.get(base) ?? 0) + 1
    sheetCount.set(base, count)
    const sheetName = count === 1 ? base : `${base.slice(0, 25)} (${count})`
    const ws = wb.addWorksheet(sheetName)
    ws.columns = [
      { key: 'nf', width: 18 },
      { key: 'cliente', width: 32 },
      { key: 'peso', width: 10 },
      { key: 'endereco', width: 42 },
      { key: 'cep', width: 12 },
    ]

    ws.mergeCells('A1:E1')
    const t = ws.getCell('A1')
    t.value = r.rota
    t.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_600 } }
    t.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 28

    // Linha 2: PLACA em destaque
    ws.mergeCells('A2:B2')
    const plcCell = ws.getCell('A2')
    plcCell.value = `🚛 PLACA: ${r.placa}`
    plcCell.font = { bold: true, size: 13, color: { argb: COR_BRAND_600.replace('FF', '') } }
    plcCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_50 } }
    plcCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(2).height = 26

    ws.mergeCells('C2:E2')
    const infoCell = ws.getCell('C2')
    infoCell.value = `Motorista: ${r.motorista}   |   Veículo: ${r.veiculo}` +
      (dataReferencia ? `   |   ${dataReferencia}` : '')
    infoCell.font = { size: 10, color: { argb: 'FF475569' } }
    infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_50 } }
    infoCell.alignment = { horizontal: 'center', vertical: 'middle' }

    ws.getRow(3).height = 8

    const colHdr = ws.getRow(4)
    colHdr.values = ['NOTA FISCAL', 'CLIENTE', 'PESO (KG)', 'ENDEREÇO', 'CEP']
    colHdr.height = 22
    colHdr.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_500 } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    r.clientes.forEach((c, idx) => {
      const row = ws.getRow(5 + idx)
      row.values = [c.notaFiscal, c.nome, c.peso ?? '', c.endereco ?? '—', formatCep(c.cep)]
      row.height = 18
      const bg = idx % 2 === 1 ? COR_BG_ALT : null
      const semEndereco = !c.endereco
      row.eachCell((cell, col) => {
        if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        if (semEndereco && col >= 4) {
          cell.font = { size: 10, color: { argb: COR_MUTED }, italic: true }
        } else {
          cell.font = { size: 10 }
        }
        cell.border = { bottom: { style: 'thin', color: { argb: COR_BORDER } } }
        cell.alignment = { vertical: 'middle' }
      })
    })

    const totalPesoXlsx = r.clientes.reduce((s, c) => s + (c.peso ?? 0), 0)
    const nextRow = 5 + r.clientes.length

    if (r.clientes.length === 0) {
      ws.mergeCells(`A5:E5`)
      const empty = ws.getCell('A5')
      empty.value = 'Nenhum cliente encontrado nesta rota'
      empty.font = { italic: true, color: { argb: COR_MUTED }, size: 10 }
      empty.alignment = { horizontal: 'center' }
    } else if (totalPesoXlsx > 0) {
      const totalRow = ws.getRow(nextRow)
      totalRow.height = 18
      for (let ci = 1; ci <= 5; ci++) {
        const cell = totalRow.getCell(ci)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_500 } }
        cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
        cell.border = { bottom: { style: 'thin', color: { argb: COR_BORDER } } }
        cell.alignment = { vertical: 'middle', horizontal: ci === 2 ? 'right' : 'center' }
      }
      totalRow.getCell(2).value = 'TOTAL'
      totalRow.getCell(3).value = totalPesoXlsx
    }

    const emptyStart = nextRow + (totalPesoXlsx > 0 ? 1 : 0)
    for (let e = 0; e < 5; e++) {
      const er = ws.getRow(emptyStart + e)
      er.height = 18
      for (let ci = 1; ci <= 5; ci++) {
        const cell = er.getCell(ci)
        cell.value = null
        cell.border = {
          bottom: { style: 'thin', color: { argb: COR_BORDER } },
          right: { style: 'thin', color: { argb: COR_BORDER } },
        }
        cell.font = { size: 10 }
      }
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer())
}

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN_X = 36
const MARGIN_TOP = 36
const MARGIN_BOTTOM = 40

const C_BRAND_600 = rgb(0.122, 0.306, 0.471)
const C_BRAND_500 = rgb(0.18, 0.46, 0.71)
const C_BRAND_50 = rgb(0.941, 0.965, 0.984)
const C_BORDER = rgb(0.886, 0.91, 0.941)
const C_INK = rgb(0.06, 0.09, 0.16)
const C_MUTED = rgb(0.58, 0.64, 0.72)
const C_WHITE = rgb(1, 1, 1)
const C_ALT = rgb(0.973, 0.98, 0.988)

const COL_W = [80, 148, 40, 210, 65]
const TABLE_W = COL_W.reduce((a, b) => a + b, 0)

function formatCep(cep: string | null): string {
  if (!cep) return '—'
  const d = cep.replace(/\D/g, '')
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`
  return cep || '—'
}

export async function gerarRomaneioPdf(
  rotas: RotaCozinha[],
  dataReferencia?: string
): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Romaneio Cozinha Industrial — TRANSMONSEG')

  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  for (const rota of rotas) {
    let page = pdf.addPage([PAGE_W, PAGE_H])
    let y = drawRotaHeader(page, fontBold, font, rota, dataReferencia)
    y = drawClienteHeader(page, fontBold, y)

    const ROW_H = 20
    let tableTop = y

    for (let i = 0; i < rota.clientes.length; i++) {
      if (y - ROW_H < MARGIN_BOTTOM + 10) {
        drawBordersV(page, tableTop, y)
        drawPageFooter(page, font, rota.rota)
        page = pdf.addPage([PAGE_W, PAGE_H])
        y = drawRotaContinuacao(page, fontBold, rota)
        y = drawClienteHeader(page, fontBold, y)
        tableTop = y
      }
      const c = rota.clientes[i]
      const bg = i % 2 === 1 ? C_ALT : null
      if (bg) {
        page.drawRectangle({
          x: MARGIN_X, y: y - ROW_H,
          width: TABLE_W, height: ROW_H,
          color: bg,
        })
      }
      const cols = [c.notaFiscal, c.nome, c.peso != null ? String(c.peso) : '', c.endereco ?? '—', formatCep(c.cep)]
      let cx = MARGIN_X
      cols.forEach((txt, ci) => {
        const w = COL_W[ci]
        const size = 8.5
        const color = !c.endereco && ci >= 3 ? C_MUTED : C_INK
        const maxW = w - 8
        let drawT = txt
        while (drawT.length > 1 && font.widthOfTextAtSize(drawT + '…', size) > maxW)
          drawT = drawT.slice(0, -1)
        if (drawT !== txt) drawT += '…'
        page.drawText(drawT, { x: cx + 4, y: y - ROW_H + 7, size, font, color })
        cx += w
      })
      page.drawLine({
        start: { x: MARGIN_X, y: y - ROW_H },
        end: { x: MARGIN_X + TABLE_W, y: y - ROW_H },
        thickness: 0.3, color: C_BORDER,
      })
      y -= ROW_H
    }

    if (rota.clientes.length === 0) {
      page.drawText('Nenhum cliente encontrado nesta rota', {
        x: MARGIN_X + 8, y: y - ROW_H + 7,
        size: 9, font, color: C_MUTED,
      })
      y -= ROW_H
    } else {
      const totalPesoPdf = rota.clientes.reduce((s, c) => s + (c.peso ?? 0), 0)
      if (totalPesoPdf > 0) {
        if (y - ROW_H < MARGIN_BOTTOM + 10) {
          drawBordersV(page, tableTop, y)
          drawPageFooter(page, font, rota.rota)
          page = pdf.addPage([PAGE_W, PAGE_H])
          y = drawRotaContinuacao(page, fontBold, rota)
          y = drawClienteHeader(page, fontBold, y)
          tableTop = y
        }
        page.drawRectangle({ x: MARGIN_X, y: y - ROW_H, width: TABLE_W, height: ROW_H, color: C_BRAND_500 })
        const lbl = 'TOTAL'
        const lblW = fontBold.widthOfTextAtSize(lbl, 8.5)
        page.drawText(lbl, {
          x: MARGIN_X + COL_W[0] + COL_W[1] - lblW - 6, y: y - ROW_H + 7,
          size: 8.5, font: fontBold, color: C_WHITE,
        })
        page.drawText(String(totalPesoPdf) + ' kg', {
          x: MARGIN_X + COL_W[0] + COL_W[1] + 4, y: y - ROW_H + 7,
          size: 8.5, font: fontBold, color: C_WHITE,
        })
        y -= ROW_H
      }
    }

    drawBordersV(page, tableTop, y)
    drawPageFooter(page, font, rota.rota)
  }

  return Buffer.from(await pdf.save())
}

function drawRotaHeader(
  page: PDFPage,
  fontBold: PDFFont,
  font: PDFFont,
  rota: RotaCozinha,
  dataRef: string | undefined
): number {
  let y = PAGE_H - MARGIN_TOP

  page.drawRectangle({ x: 0, y: y - 4, width: PAGE_W, height: 4, color: C_BRAND_600 })
  y -= 4

  page.drawRectangle({ x: MARGIN_X, y: y - 30, width: TABLE_W, height: 30, color: C_BRAND_600 })
  const rotaText = rota.rota
  const rotaW = fontBold.widthOfTextAtSize(rotaText, 14)
  page.drawText(rotaText, {
    x: MARGIN_X + (TABLE_W - rotaW) / 2, y: y - 20,
    size: 14, font: fontBold, color: C_WHITE,
  })
  y -= 30

  // Linha placa em destaque
  const PLACA_H = 24
  page.drawRectangle({ x: MARGIN_X, y: y - PLACA_H, width: TABLE_W * 0.38, height: PLACA_H, color: C_BRAND_600 })
  const placaLabel = `PLACA: ${rota.placa}`
  const placaW = fontBold.widthOfTextAtSize(placaLabel, 11)
  page.drawText(placaLabel, {
    x: MARGIN_X + (TABLE_W * 0.38 - placaW) / 2, y: y - PLACA_H + 8,
    size: 11, font: fontBold, color: C_WHITE,
  })
  page.drawRectangle({ x: MARGIN_X + TABLE_W * 0.38, y: y - PLACA_H, width: TABLE_W * 0.62, height: PLACA_H, color: C_BRAND_50 })
  const infoText = `Motorista: ${rota.motorista}  ·  ${rota.veiculo}` + (dataRef ? `  ·  ${dataRef}` : '')
  const infoW = font.widthOfTextAtSize(infoText, 9)
  page.drawText(infoText, {
    x: MARGIN_X + TABLE_W * 0.38 + (TABLE_W * 0.62 - infoW) / 2, y: y - PLACA_H + 8,
    size: 9, font, color: C_BRAND_600,
  })
  y -= PLACA_H

  y -= 8
  return y
}

function drawRotaContinuacao(page: PDFPage, fontBold: PDFFont, rota: RotaCozinha): number {
  const y = PAGE_H - MARGIN_TOP
  page.drawRectangle({ x: 0, y: y - 4, width: PAGE_W, height: 4, color: C_BRAND_600 })
  const txt = `${rota.rota} (continuação)`
  const tw = fontBold.widthOfTextAtSize(txt, 11)
  page.drawText(txt, {
    x: (PAGE_W - tw) / 2, y: y - 22,
    size: 11, font: fontBold, color: C_BRAND_600,
  })
  return y - 32
}

function drawClienteHeader(page: PDFPage, fontBold: PDFFont, y: number): number {
  const H = 22
  page.drawRectangle({ x: MARGIN_X, y: y - H, width: TABLE_W, height: H, color: C_BRAND_500 })
  const labels = ['NOTA FISCAL', 'CLIENTE', 'KG', 'ENDEREÇO', 'CEP']
  let cx = MARGIN_X
  labels.forEach((lbl, i) => {
    const w = COL_W[i]
    const size = 8.5
    const tw = fontBold.widthOfTextAtSize(lbl, size)
    page.drawText(lbl, {
      x: cx + (w - tw) / 2, y: y - H + 7,
      size, font: fontBold, color: C_WHITE,
    })
    cx += w
  })
  return y - H
}

function drawBordersV(page: PDFPage, topY: number, bottomY: number) {
  let cx = MARGIN_X
  for (let i = 0; i <= COL_W.length; i++) {
    page.drawLine({
      start: { x: cx, y: topY },
      end: { x: cx, y: bottomY },
      thickness: 0.4, color: C_BORDER,
    })
    if (i < COL_W.length) cx += COL_W[i]
  }
}

function drawPageFooter(page: PDFPage, font: PDFFont, rotaNome: string) {
  const txt = `TRANSMONSEG  ·  ${rotaNome}  ·  Gerado em ${fmtInstanteBR(new Date(), { dateStyle: 'short', timeStyle: 'medium' })}`
  const size = 7
  const tw = font.widthOfTextAtSize(txt, size)
  page.drawText(txt, {
    x: (PAGE_W - tw) / 2, y: MARGIN_BOTTOM - 20,
    size, font, color: C_MUTED,
  })
}
