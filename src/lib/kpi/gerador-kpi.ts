import ExcelJS from 'exceljs'
import type { KpiLinha } from '@/lib/types/kpi'
import { KPI_COLORS, KPI_FONTS, KPI_BORDER_THIN, REDE_NOMES_CANONICOS, formataDataPtBr } from './kpi-styles'
import { getLogoBuffer, carregarOuCriarWorkbook, nomeAbaDoDia } from './template-loader'
import { getMatrizLojas } from '@/lib/lojas/catalogo-matriz'
import { joinObsTexts, temAnomaliaHigh } from './anomalia-obs'
import { agruparPorLoja, type LinhaAgrupada } from './agrupar-por-loja'

/** Linha enriquecida com info que não está no schema kpi_linhas. */
export interface LinhaParaKpi extends KpiLinha {
  motorista_codigo?: number | string | null
}

export interface GerarKpiInput {
  rede_id: string
  data: string // YYYY-MM-DD
  linhas: LinhaParaKpi[]
  /** XLSX do mês carregado do Storage; se null cria novo */
  arquivoExistente?: Buffer | null
}

function toExcelTime(d: Date | null | undefined): number | null {
  if (!d) return null
  const brt = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return (brt.getHours() * 3600 + brt.getMinutes() * 60 + brt.getSeconds()) / 86400
}

export async function gerarKpi(input: GerarKpiInput): Promise<Buffer> {
  const { rede_id, data, linhas, arquivoExistente } = input
  const wb = await carregarOuCriarWorkbook(arquivoExistente ?? null)
  const nomeAba = nomeAbaDoDia(data)
  const redeNome = REDE_NOMES_CANONICOS[rede_id] ?? rede_id

  // Remove aba do dia se já existir
  const abaExistente = wb.getWorksheet(nomeAba)
  if (abaExistente) wb.removeWorksheet(abaExistente.id)

  const ws = wb.addWorksheet(nomeAba, { views: [{ state: 'frozen', ySplit: 4 }] })
  await preencherAba(ws, wb, { rede_id, redeNome, data, linhas })

  // Garantir aba BASE se Zona Sul
  if (rede_id === 'ZONA_SUL') {
    const { gerarAbaBaseZonaSul } = await import('./zona-sul-base')
    gerarAbaBaseZonaSul(wb)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from(await wb.xlsx.writeBuffer() as any) as any
}

async function preencherAba(
  ws: ExcelJS.Worksheet,
  wb: ExcelJS.Workbook,
  ctx: { rede_id: string; redeNome: string; data: string; linhas: LinhaParaKpi[] },
) {
  const { rede_id, redeNome, data, linhas } = ctx
  const TOTAL_COLS = 15
  const lastCol = 'O'

  ws.columns = [
    { width: 35 }, { width: 28 }, { width: 8 },  { width: 10 }, { width: 8 },
    { width: 8 },  { width: 8 },  { width: 8 },  { width: 28 }, { width: 8 },
    { width: 10 }, { width: 8 },  { width: 8 },  { width: 8 },  { width: 30 },
  ]

  // Row 1: header amarelo + logo
  ws.mergeCells(`A1:${lastCol}1`)
  const c1 = ws.getCell('A1')
  c1.value = `RELATÓRIO KPI · ${redeNome}`
  c1.font = KPI_FONTS.TITLE
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.TRANSMONSEG_YELLOW } }
  c1.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 50

  try {
    const logoBuf = await getLogoBuffer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logoId = wb.addImage({ buffer: logoBuf as any, extension: 'png' })
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 100, height: 50 }, editAs: 'oneCell' })
    ws.addImage(logoId, { tl: { col: TOTAL_COLS - 1, row: 0 }, ext: { width: 100, height: 50 }, editAs: 'oneCell' })
  } catch (e) {
    console.warn(`Logo não encontrada: ${(e as Error).message}`)
  }

  // Row 2: subtítulo + grupos de carro
  ws.getCell('A2').value = `BENASSI · ${formataDataPtBr(data)}`
  ws.getCell('A2').font = KPI_FONTS.SUBTITLE
  ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells('B2:H2')
  ws.getCell('B2').value = `${redeNome} — 1º CARRO`
  ws.getCell('B2').font = { ...KPI_FONTS.HEADER, color: { argb: 'FFFFFFFF' } }
  ws.getCell('B2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BRAND_BLUE } }
  ws.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells('I2:N2')
  ws.getCell('I2').value = `${redeNome} — 2º CARRO`
  ws.getCell('I2').font = { ...KPI_FONTS.HEADER, color: { argb: 'FFFFFFFF' } }
  ws.getCell('I2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3A5C' } }
  ws.getCell('I2').alignment = { horizontal: 'center', vertical: 'middle' }

  ws.getRow(2).height = 22

  // Row 3: separador
  ws.getRow(3).height = 8

  // Row 4: headers
  const headerRow = ws.getRow(4)
  headerRow.values = [
    'REDES / FILIAIS',
    'MOTORISTA', 'CÓD', 'PLACA', 'SAÍDA CD', 'CHD LOJA', 'SAÍDA LOJA', 'TEMPO',
    'MOTORISTA', 'CÓD', 'PLACA', 'CHD LOJA', 'SAÍDA LOJA', 'TEMPO',
    'OBS',
  ]
  headerRow.height = 30
  headerRow.eachCell((cell) => {
    cell.font = KPI_FONTS.HEADER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BRAND_BLUE } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  // Dados agrupados por loja
  const lojasNoDia = [...new Set(linhas.map((l) => l.loja_nome).filter(Boolean))]
  const ordemLojas = getMatrizLojas(rede_id, lojasNoDia)
  const agrupadas = agruparPorLoja(linhas)
  const agrupadasMap = new Map(agrupadas.map((a) => [a.loja_nome, a]))

  let rowIdx = 5
  for (const loja of ordemLojas) {
    const agrupada = agrupadasMap.get(loja) ?? { loja_nome: loja, carro1: null, carro2: null }
    if (!agrupada.carro1 && !agrupada.carro2) {
      escreverLinhaPlaceholder15(ws, rowIdx, loja)
    } else {
      escreverLinhaDados15(ws, rowIdx, agrupada)
    }
    rowIdx++
  }
}

function escreverLinhaDados15(ws: ExcelJS.Worksheet, row: number, ag: LinhaAgrupada) {
  const r = ws.getRow(row)
  r.height = 22

  const c1 = ag.carro1
  const c2 = ag.carro2

  const saida1 = toExcelTime(c1?.saida_cd)
  const chd1   = toExcelTime(c1?.chd_loja_1)
  const sai1   = toExcelTime(c1?.saida_loja_1)
  const chd2   = toExcelTime(c2?.chd_loja_1)
  const sai2   = toExcelTime(c2?.saida_loja_1)

  r.values = [
    ag.loja_nome,
    c1?.motorista ?? '',
    c1?.motorista_codigo ?? '',
    c1?.placa ?? '',
    saida1 ?? '',
    chd1 ?? '',
    sai1 ?? '',
    '',
    c2?.motorista ?? '',
    c2?.motorista_codigo ?? '',
    c2?.placa ?? '',
    chd2 ?? '',
    sai2 ?? '',
    '',
    joinObsTexts([
      ...((c1?.anomalias_codigos) ?? []),
      ...((c2?.anomalias_codigos) ?? []),
    ]) || '',
  ]

  if (chd1 !== null && sai1 !== null) {
    ws.getCell(row, 8).value = { formula: `MOD(G${row}-F${row},1)` }
    ws.getCell(row, 8).numFmt = 'HH:MM'
  }
  if (chd2 !== null && sai2 !== null) {
    ws.getCell(row, 14).value = { formula: `MOD(M${row}-L${row},1)` }
    ws.getCell(row, 14).numFmt = 'HH:MM'
  }

  for (const colIdx of [5, 6, 7, 12, 13]) {
    const cell = ws.getCell(row, colIdx)
    if (cell.value !== '') cell.numFmt = 'HH:MM'
  }

  const codigos = [...((c1?.anomalias_codigos) ?? []), ...((c2?.anomalias_codigos) ?? [])]
  const hasHigh = temAnomaliaHigh(codigos)
  const zebraColor = row % 2 === 0 ? KPI_COLORS.BG_ZEBRA : KPI_COLORS.BG_WHITE
  const bgColor = hasHigh ? KPI_COLORS.ANOMALIA_HIGH_BG : zebraColor

  r.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.font = KPI_FONTS.BODY
    cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
    cell.border = KPI_BORDER_THIN
  })
}

function escreverLinhaPlaceholder15(ws: ExcelJS.Worksheet, row: number, loja: string) {
  const r = ws.getRow(row)
  r.height = 22
  r.values = [loja, ...Array(14).fill('')]
  r.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.font = colNum === 1 ? KPI_FONTS.BODY_MUTED : KPI_FONTS.BODY
    cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
    cell.border = KPI_BORDER_THIN
  })
}

