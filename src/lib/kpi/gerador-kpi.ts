import ExcelJS from 'exceljs'
import type { KpiLinha } from '@/lib/types/kpi'
import { KPI_COLORS, KPI_FONTS, KPI_BORDER_THIN, REDE_NOMES_CANONICOS } from './kpi-styles'
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

const NAVY = 'FF1F3864'
const ROW_BG = 'FFFFFFCC'

const FONT_HEADER = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
const FONT_BODY   = { name: 'Calibri', size: 12, color: { argb: 'FF000000' } }
const FILL_NAVY   = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: NAVY } }

async function preencherAba(
  ws: ExcelJS.Worksheet,
  wb: ExcelJS.Workbook,
  ctx: { rede_id: string; redeNome: string; data: string; linhas: LinhaParaKpi[] },
) {
  const { rede_id, redeNome, data, linhas } = ctx

  // Larguras idênticas ao template de referência
  ws.columns = [
    { width: 44.5 }, // A: REDES/FILIAIS
    { width: 23.8 }, // B: MOTORISTA 1º
    { width: 13.5 }, // C: COD 1º
    { width: 16.7 }, // D: PLACA 1º
    { width: 20.1 }, // E: SAIDA CD 1º
    { width: 21   }, // F: CHD LOJA 1º
    { width: 23.5 }, // G: SAIDA LOJA 1º
    { width: 23.8 }, // H: MOTORISTA 2º
    { width: 13.5 }, // I: COD 2º
    { width: 16.7 }, // J: PLACA 2º
    { width: 20.1 }, // K: SAIDA CD 2º
    { width: 21   }, // L: CHD LOJA 2º
    { width: 23.5 }, // M: SAIDA LOJA 2º
    { width: 31.5 }, // N: TEMPO EM LOJA 1
    { width: 31.5 }, // O: TEMPO EM LOJA 2
  ]

  // Row 1 — logo + fundo navy, altura 86 (sem merge — igual ao template de referência)
  ws.getRow(1).height = 86.25
  for (let c = 1; c <= 15; c++) {
    ws.getCell(1, c).fill = FILL_NAVY
  }
  try {
    const logoBuf = await getLogoBuffer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logoId = wb.addImage({ buffer: logoBuf as any, extension: 'png' })
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 220, height: 80 }, editAs: 'oneCell' })
  } catch {
    ws.getCell('A1').value = redeNome
    ws.getCell('A1').font = { name: 'Calibri', size: 36, bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  }

  // Row 2 — grupos 1º/2º CARRO (B2:G2 e H2:M2) — A2 vazio igual ao template
  ws.getRow(2).height = 23.25
  for (let c = 1; c <= 15; c++) {
    ws.getCell(2, c).fill = FILL_NAVY
  }

  ws.mergeCells('B2:G2')
  const b2 = ws.getCell('B2')
  b2.value = `${redeNome} 1º CARRO`
  b2.font = FONT_HEADER
  b2.fill = FILL_NAVY
  b2.alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells('H2:M2')
  const h2 = ws.getCell('H2')
  h2.value = `${redeNome} 2º CARRO`
  h2.font = FONT_HEADER
  h2.fill = FILL_NAVY
  h2.alignment = { horizontal: 'center', vertical: 'middle' }

  // Row 3 — headers das colunas (igual ao template de referência)
  const headerRow = ws.getRow(3)
  headerRow.height = 23.25
  headerRow.values = [
    'REDES / FILIAIS',
    'MOTORISTA', 'COD', 'PLACA', 'SAIDA CD', 'CHD LOJA', 'SAIDA LOJA',
    'MOTORISTA', 'COD', 'PLACA', 'SAIDA CD', 'CHD LOJA', 'SAIDA LOJA',
    'TEMPO EM LOJA 1', 'TEMPO EM LOJA 2',
  ]
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = FONT_HEADER
    cell.fill = FILL_NAVY
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { left: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' } }
  })

  // Row 4 — espaçador vazio
  ws.getRow(4).height = 23.25

  // Dados a partir da linha 5
  const lojasNoDia = [...new Set(linhas.map((l) => l.loja_nome).filter(Boolean))]
  const ordemLojas = getMatrizLojas(rede_id, lojasNoDia)
  const agrupadas = agruparPorLoja(linhas)
  const agrupadasMap = new Map(agrupadas.map((a) => [a.loja_nome, a]))

  let rowIdx = 5
  for (const loja of ordemLojas) {
    const ag = agrupadasMap.get(loja) ?? { loja_nome: loja, carro1: null, carro2: null }
    escreverLinha(ws, rowIdx, ag)
    rowIdx++
  }
}

function escreverLinha(ws: ExcelJS.Worksheet, row: number, ag: LinhaAgrupada) {
  const r = ws.getRow(row)
  r.height = 23.25

  const c1 = ag.carro1
  const c2 = ag.carro2

  const saida1 = toExcelTime(c1?.saida_cd)
  const chd1   = toExcelTime(c1?.chd_loja_1)
  const sai1   = toExcelTime(c1?.saida_loja_1)
  const saida2 = toExcelTime(c2?.saida_cd)
  const chd2   = toExcelTime(c2?.chd_loja_1)
  const sai2   = toExcelTime(c2?.saida_loja_1)

  r.values = [
    ag.loja_nome,
    c1?.motorista ?? '', c1?.motorista_codigo ?? '', c1?.placa ?? '',
    saida1 ?? '', chd1 ?? '', sai1 ?? '',
    c2?.motorista ?? '', c2?.motorista_codigo ?? '', c2?.placa ?? '',
    saida2 ?? '', chd2 ?? '', sai2 ?? '',
    '', '',
  ]

  // Formatos de hora
  for (const colIdx of [5, 6, 7, 11, 12, 13]) {
    const cell = ws.getCell(row, colIdx)
    if (cell.value !== '') cell.numFmt = 'HH:MM'
  }

  // TEMPO EM LOJA (fórmula)
  if (chd1 !== null && sai1 !== null) {
    ws.getCell(row, 14).value = { formula: `MOD(G${row}-F${row},1)` }
    ws.getCell(row, 14).numFmt = 'HH:MM'
  }
  if (chd2 !== null && sai2 !== null) {
    ws.getCell(row, 15).value = { formula: `MOD(M${row}-L${row},1)` }
    ws.getCell(row, 15).numFmt = 'HH:MM'
  }

  const codigos = [...((c1?.anomalias_codigos) ?? []), ...((c2?.anomalias_codigos) ?? [])]
  const bgColor = temAnomaliaHigh(codigos) ? KPI_COLORS.ANOMALIA_HIGH_BG : ROW_BG

  r.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.font = FONT_BODY
    cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
  })
}

