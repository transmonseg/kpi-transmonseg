import ExcelJS from 'exceljs'
import type { RotaCozinha } from './cozinha-parser'

export async function gerarXlsx(
  rotas: RotaCozinha[],
  dataReferencia?: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Escala Cozinha')

  ws.columns = [
    { key: 'idx', width: 6 },
    { key: 'rota', width: 32 },
    { key: 'motorista', width: 30 },
    { key: 'placa', width: 14 },
  ]

  // Título
  ws.mergeCells('A1:D1')
  const titleCell = ws.getCell('A1')
  titleCell.value = 'ESCALA COZINHA INDUSTRIAL'
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  if (dataReferencia) {
    ws.mergeCells('A2:D2')
    const dataCell = ws.getCell('A2')
    dataCell.value = `Data: ${dataReferencia}`
    dataCell.font = { italic: true, size: 11 }
    dataCell.alignment = { horizontal: 'center' }
  }

  // Headers
  const headerRow = ws.getRow(4)
  headerRow.values = ['#', 'ROTA', 'MOTORISTA', 'PLACA']
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  headerRow.eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E75B6' },
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  // Dados
  const border = {
    top: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
    left: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
    right: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
  }

  rotas.forEach((r, i) => {
    const row = ws.getRow(5 + i)
    row.values = [i + 1, r.rota, r.motorista, r.placa]
    row.eachCell((cell, colNumber) => {
      cell.border = border
      cell.alignment = {
        horizontal: colNumber === 1 || colNumber === 4 ? 'center' : 'left',
        vertical: 'middle',
      }
      if (i % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' },
        }
      }
    })
  })

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
