import ExcelJS from 'exceljs'
import type { KpiLinha } from '@/lib/types/kpi'

const COR_BRAND_600 = 'FF1F4E78'
const COR_BRAND_400 = 'FF2E75B6'
const COR_BG_ALT = 'FFF8FAFC'
const COR_BORDER = 'FFE2E8F0'

function fmt(date: Date | null): string {
  if (!date) return ''
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

export async function gerarKpiXlsx(params: {
  rede_id: string
  rede_nome: string
  data: string
  linhas: KpiLinha[]
}): Promise<Buffer> {
  const { rede_nome, data, linhas } = params
  const nLojas = maxLojas(linhas)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()

  const totalCols = 4 + nLojas * 3 + 1
  const lastColLetter = colLetter(totalCols)

  const ws = wb.addWorksheet('KPI', {
    views: [{ state: 'frozen', ySplit: 5 }],
  })

  const colDefs: { key: string; width: number }[] = [
    { key: 'loja', width: 30 },
    { key: 'motorista', width: 28 },
    { key: 'placa', width: 13 },
    { key: 'saida_cd', width: 14 },
  ]
  for (let n = 1; n <= nLojas; n++) {
    colDefs.push({ key: `chd_${n}`, width: 16 })
    colDefs.push({ key: `sai_${n}`, width: 16 })
    colDefs.push({ key: `tempo_${n}`, width: 14 })
  }
  colDefs.push({ key: 'obs', width: 22 })
  ws.columns = colDefs

  // Row 1: title
  ws.mergeCells(`A1:${lastColLetter}1`)
  const t = ws.getCell('A1')
  t.value = `KPI ${rede_nome}`
  t.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_600 } }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 32

  // Row 2: subtitle date
  ws.mergeCells(`A2:${lastColLetter}2`)
  const s = ws.getCell('A2')
  s.value = fmtData(data)
  s.font = { size: 12, color: { argb: 'FFFFFFFF' } }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_400 } }
  s.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 20

  // Row 3: TRANSMONSEG
  ws.mergeCells(`A3:${lastColLetter}3`)
  const brand = ws.getCell('A3')
  brand.value = 'TRANSMONSEG'
  brand.font = { italic: true, size: 10, color: { argb: 'FF475569' } }
  brand.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(3).height = 18

  // Row 4: spacer
  ws.getRow(4).height = 8

  // Row 5: headers
  const headerLabels: string[] = ['REDES/FILIAIS', 'MOTORISTA', 'PLACA', 'SAÍDA CD']
  for (let n = 1; n <= nLojas; n++) {
    headerLabels.push(`CHE. LOJA ${n}`, `SAÍ. LOJA ${n}`, `TEMPO LOJA ${n}`)
  }
  headerLabels.push('OBS')

  const headerRow = ws.getRow(5)
  headerRow.values = headerLabels
  headerRow.height = 24
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRAND_600 } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  // Data rows
  const borderThin = {
    top: { style: 'thin' as const, color: { argb: COR_BORDER } },
    left: { style: 'thin' as const, color: { argb: COR_BORDER } },
    bottom: { style: 'thin' as const, color: { argb: COR_BORDER } },
    right: { style: 'thin' as const, color: { argb: COR_BORDER } },
  }

  linhas.forEach((l, i) => {
    const row = ws.getRow(6 + i)
    const values: (string | number | null)[] = [
      l.loja_nome,
      l.motorista ?? '',
      l.placa ?? '',
      fmt(l.saida_cd),
    ]
    for (let n = 1; n <= nLojas; n++) {
      const chd = n === 1 ? l.chd_loja_1 : n === 2 ? l.chd_loja_2 : l.chd_loja_3
      const sai = n === 1 ? l.saida_loja_1 : n === 2 ? l.saida_loja_2 : l.saida_loja_3
      const tempo = n === 1 ? l.tempo_loja_1_min : n === 2 ? l.tempo_loja_2_min : l.tempo_loja_3_min
      values.push(fmt(chd), fmt(sai), tempo ?? '')
    }
    values.push(l.observacao ?? '')

    row.values = values
    row.height = 20

    const bgArgb = i % 2 === 1 ? COR_BG_ALT : null

    row.eachCell((cell, colNum) => {
      cell.border = borderThin
      cell.font = { size: 10 }
      cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
      if (bgArgb) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } }
      }
    })
  })

  return Buffer.from(await wb.xlsx.writeBuffer())
}

function colLetter(n: number): string {
  let result = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    result = String.fromCharCode(65 + rem) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}
