import ExcelJS from 'exceljs'
import type { RotaCozinha, EstatisticasCozinha } from './cozinha-parser'

const COR_BRAND_700 = 'FF1A426A'
const COR_BRAND_600 = 'FF1F4E78'
const COR_BRAND_500 = 'FF2E75B6'
const COR_BRAND_50 = 'FFF0F6FB'
const COR_BG_ALT = 'FFF8FAFC'
const COR_BORDER = 'FFE2E8F0'
const COR_AMBAR_BG = 'FFFEF3C7'
const COR_AMBAR_TXT = 'FF92400E'
const COR_AMARELO_BG = 'FFFEFCE8'  // yellow-50
const COR_AMARELO_TXT = 'FF713F12' // yellow-900 dark

export async function gerarXlsx(
  rotas: RotaCozinha[],
  estatisticas: EstatisticasCozinha,
  dataReferencia?: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()

  const ws = wb.addWorksheet('Escala Cozinha', {
    views: [{ state: 'frozen', ySplit: 6 }],
  })

  ws.columns = [
    { key: 'idx', width: 5 },
    { key: 'rota', width: 28 },
    { key: 'motorista', width: 28 },
    { key: 'placa', width: 13 },
    { key: 'veiculo', width: 22 },
    { key: 'status', width: 16 },
  ]

  // Título
  ws.mergeCells('A1:F1')
  const t = ws.getCell('A1')
  t.value = 'ESCALA COZINHA INDUSTRIAL'
  t.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_600 } }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 32

  // Subtítulo
  if (dataReferencia) {
    ws.mergeCells('A2:F2')
    const s = ws.getCell('A2')
    s.value = `Data de referência: ${dataReferencia}`
    s.font = { italic: true, size: 11, color: { argb: 'FF475569' } }
    s.alignment = { horizontal: 'center' }
    ws.getRow(2).height = 20
  }

  // Resumo estatístico
  ws.mergeCells('A3:F3')
  const resumo = ws.getCell('A3')
  resumo.value =
    `Total: ${estatisticas.total}  ·  ` +
    `Completas: ${estatisticas.completas}  ·  ` +
    `Sem placa: ${estatisticas.semPlaca}  ·  ` +
    `Vazias: ${estatisticas.vazias}` +
    (estatisticas.duplicadas > 0
      ? `  ·  Rotas duplicadas: ${estatisticas.duplicadas}`
      : '')
  resumo.font = { bold: true, size: 10, color: { argb: 'FF1A426A' } }
  resumo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_50 } }
  resumo.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(3).height = 22

  // Linha vazia
  ws.getRow(4).height = 8

  // Headers de tabela (linha 5)
  const headerRow = ws.getRow(5)
  headerRow.values = ['#', 'ROTA', 'MOTORISTA', 'PLACA', 'VEÍCULO', 'STATUS']
  headerRow.height = 24
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_500 } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      bottom: { style: 'thin', color: { argb: COR_BRAND_700 } },
    }
  })

  // Dados
  const borderThin = {
    top: { style: 'thin' as const, color: { argb: COR_BORDER } },
    left: { style: 'thin' as const, color: { argb: COR_BORDER } },
    bottom: { style: 'thin' as const, color: { argb: COR_BORDER } },
    right: { style: 'thin' as const, color: { argb: COR_BORDER } },
  }

  rotas.forEach((r, i) => {
    const row = ws.getRow(6 + i)
    const statusLabel = labelStatus(r.status)
    row.values = [i + 1, r.rota, r.motorista, r.placa, r.veiculo, statusLabel]
    row.height = 20

    // Determine row background based on status
    const rowArgb =
      r.status === 'vazia'
        ? 'FFFEFCE8'
        : r.status === 'sem-placa' || r.status === 'sem-motorista'
        ? 'FFFEF9C3'
        : i % 2 === 1
        ? COR_BG_ALT
        : null

    row.eachCell((cell, colNumber) => {
      cell.border = borderThin
      cell.alignment = {
        horizontal:
          colNumber === 1 || colNumber === 4 || colNumber === 6
            ? 'center'
            : 'left',
        vertical: 'middle',
      }
      cell.font = { size: 11 }

      // Row tint based on status (completa keeps alternating)
      if (rowArgb !== null) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowArgb },
        }
      }
    })

    // Status cell always gets its specific color regardless of row bg
    const statusCell = row.getCell(6)
    statusCell.font = { size: 10, bold: true, color: { argb: corStatusTxt(r.status) } }
    statusCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: corStatusBg(r.status) },
    }
  })

  return Buffer.from(await wb.xlsx.writeBuffer())
}

function labelStatus(s: RotaCozinha['status']): string {
  switch (s) {
    case 'completa':
      return 'OK'
    case 'sem-placa':
      return 'SEM PLACA'
    case 'sem-motorista':
      return 'SEM MOTORISTA'
    case 'vazia':
      return 'VAZIA'
  }
}

function corStatusBg(s: RotaCozinha['status']): string {
  switch (s) {
    case 'completa':
      return 'FFD1FAE5'
    case 'sem-placa':
    case 'sem-motorista':
      return COR_AMBAR_BG
    case 'vazia':
      return COR_AMARELO_BG
  }
}

function corStatusTxt(s: RotaCozinha['status']): string {
  switch (s) {
    case 'completa':
      return 'FF065F46'
    case 'sem-placa':
    case 'sem-motorista':
      return COR_AMBAR_TXT
    case 'vazia':
      return COR_AMARELO_TXT
  }
}
