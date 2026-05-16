import ExcelJS from 'exceljs'
import type { KpiLinha } from '@/lib/types/kpi'
import { KPI_COLORS, KPI_FONTS, KPI_BORDER_THIN, REDE_NOMES_CANONICOS, formataDataPtBr } from './kpi-styles'
import { getLogoBuffer, carregarOuCriarWorkbook, nomeAbaDoDia } from './template-loader'
import { getMatrizLojas, detectarMaxLojasPorRota } from '@/lib/lojas/catalogo-matriz'
import { joinObsTexts, temAnomaliaHigh } from './anomalia-obs'

/** Linha enriquecida com info que não está no schema kpi_linhas. */
export interface LinhaParaKpi extends KpiLinha {
  motorista_codigo?: number | string | null
  anomalias_codigos?: string[]
}

export interface GerarKpiInput {
  rede_id: string
  data: string // YYYY-MM-DD
  linhas: LinhaParaKpi[]
  /** XLSX do mês carregado do Storage; se null cria novo */
  arquivoExistente?: Buffer | null
}

function fmt(d: Date | null | undefined): string {
  if (!d) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
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
  const maxLojas = detectarMaxLojasPorRota(linhas)
  const totalCols = 4 + maxLojas * 3 + 1
  const lastCol = colLetter(totalCols)

  // Larguras
  ws.columns = [
    { width: 35 }, { width: 28 }, { width: 10 }, { width: 12 },
    ...Array.from({ length: maxLojas * 3 }, () => ({ width: 12 })),
    { width: 30 },
  ]

  // Row 1: header amarelo com logo
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
    ws.addImage(logoId, { tl: { col: totalCols - 1, row: 0 }, ext: { width: 100, height: 50 }, editAs: 'oneCell' })
  } catch (e) {
    console.warn(`Logo não encontrada: ${(e as Error).message}`)
  }

  // Row 2: subtítulo BENASSI + data
  ws.mergeCells(`A2:${lastCol}2`)
  const c2 = ws.getCell('A2')
  c2.value = `BENASSI · ${formataDataPtBr(data)}`
  c2.font = KPI_FONTS.SUBTITLE
  c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BG_WHITE } }
  c2.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 22

  // Row 3: separador
  ws.getRow(3).height = 8

  // Row 4: headers
  const headers: string[] = ['REDES / FILIAIS', 'MOTORISTA', 'CÓDIGO', 'PLACA']
  for (let n = 1; n <= maxLojas; n++) {
    headers.push(`CHD LOJA ${n}`, `SAÍDA LOJA ${n}`, `TEMPO LOJA ${n}`)
  }
  headers.push('OBS')

  const headerRow = ws.getRow(4)
  headerRow.values = headers
  headerRow.height = 30
  headerRow.eachCell((cell) => {
    cell.font = KPI_FONTS.HEADER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BRAND_BLUE } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  // Dados na ordem da matriz
  const lojasNoDia = [...new Set(linhas.map((l) => l.loja_nome).filter(Boolean))]
  const ordem = getMatrizLojas(rede_id, lojasNoDia)
  let rowIdx = 5
  for (const loja of ordem) {
    const linhasDessaLoja = linhas.filter((l) => l.loja_nome === loja)
    if (linhasDessaLoja.length === 0) {
      escreverLinhaPlaceholder(ws, rowIdx, loja, maxLojas)
      rowIdx++
      continue
    }
    for (const linha of linhasDessaLoja) {
      escreverLinhaDados(ws, rowIdx, linha, maxLojas)
      rowIdx++
    }
  }
}

function escreverLinhaPlaceholder(ws: ExcelJS.Worksheet, row: number, loja: string, maxLojas: number) {
  const r = ws.getRow(row)
  r.height = 22
  const empties = Array(4 + maxLojas * 3 + 1 - 1).fill('')
  r.values = [loja, ...empties]
  r.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.font = colNum === 1 ? KPI_FONTS.BODY_MUTED : KPI_FONTS.BODY
    cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
    cell.border = KPI_BORDER_THIN
  })
}

function escreverLinhaDados(ws: ExcelJS.Worksheet, row: number, linha: LinhaParaKpi, maxLojas: number) {
  const r = ws.getRow(row)
  r.height = 22

  const motoristaTexto = (linha.motorista ?? '') + (linha.carro_ordem === 2 ? ' (2º CARRO)' : '')
  const values: (string | number | null)[] = [
    linha.loja_nome,
    motoristaTexto,
    linha.motorista_codigo ?? '',
    linha.placa ?? '',
    fmt(linha.saida_cd),
  ]
  for (let n = 1; n <= maxLojas; n++) {
    const chd = n === 1 ? linha.chd_loja_1 : n === 2 ? linha.chd_loja_2 : linha.chd_loja_3
    const sai = n === 1 ? linha.saida_loja_1 : n === 2 ? linha.saida_loja_2 : linha.saida_loja_3
    const tempo = n === 1 ? linha.tempo_loja_1_min : n === 2 ? linha.tempo_loja_2_min : linha.tempo_loja_3_min
    values.push(fmt(chd), fmt(sai), tempo ?? '')
  }
  const obs = joinObsTexts(linha.anomalias_codigos ?? [])
  values.push(obs)

  r.values = values

  const hasHigh = temAnomaliaHigh(linha.anomalias_codigos ?? [])
  const zebraColor = row % 2 === 0 ? KPI_COLORS.BG_ZEBRA : KPI_COLORS.BG_WHITE
  const bgColor = hasHigh ? KPI_COLORS.ANOMALIA_HIGH_BG : zebraColor

  r.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.font = KPI_FONTS.BODY
    cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
    cell.border = KPI_BORDER_THIN
    // Formatação condicional do TEMPO LOJA
    const tempoCols = Array.from({ length: maxLojas }, (_, i) => 5 + (i * 3) + 2) // 7, 10, 13
    if (tempoCols.includes(colNum) && typeof cell.value === 'number') {
      const tempo = cell.value as number
      let color: string
      if (tempo <= 60) color = KPI_COLORS.TEMPO_GOOD
      else if (tempo <= 120) color = KPI_COLORS.TEMPO_MEDIUM
      else color = KPI_COLORS.TEMPO_HIGH
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
    }
  })
}
