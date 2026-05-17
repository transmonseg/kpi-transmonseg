import ExcelJS from 'exceljs'
import type { KpiLinha } from '@/lib/types/kpi'
import { KPI_COLORS, REDE_NOMES_CANONICOS } from './kpi-styles'
import { getLogoBuffer, carregarOuCriarWorkbook, nomeAbaDoDia } from './template-loader'
import { getMatrizLojas } from '@/lib/lojas/catalogo-matriz'
import { temAnomaliaHigh } from './anomalia-obs'
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

function totalTempoMin(l: LinhaParaKpi | null): number | null {
  if (!l) return null
  const t = l.tempo_loja_1_min
  return t !== null && t > 0 ? t : null
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

const NAVY      = 'FF1F3864'
const ROW_BG     = 'FFFFFFCC'
const ROW_BG_ALT = 'FFFFFFFF'

const FONT_HEADER = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
const FONT_BODY   = { name: 'Calibri', size: 12, color: { argb: 'FF000000' } }
const FILL_NAVY   = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: NAVY } }

const COLS_DUPLO = [
  { width: 44.5 }, // A: REDES/FILIAIS
  { width: 23.8 }, // B: MOTORISTA 1
  { width: 13.5 }, // C: COD 1
  { width: 16.7 }, // D: PLACA 1
  { width: 20.1 }, // E: SAIDA CD 1
  { width: 21   }, // F: CHD LOJA 1
  { width: 23.5 }, // G: SAIDA LOJA 1
  { width: 23.8 }, // H: MOTORISTA 2
  { width: 13.5 }, // I: COD 2
  { width: 16.7 }, // J: PLACA 2
  { width: 20.1 }, // K: SAIDA CD 2
  { width: 21   }, // L: CHD LOJA 2
  { width: 23.5 }, // M: SAIDA LOJA 2
  { width: 31.5 }, // N: TEMPO 1º CARRO
  { width: 31.5 }, // O: TEMPO 2º CARRO
]

const COLS_SIMPLES = [
  { width: 44.5 }, // A: REDES/FILIAIS
  { width: 23.8 }, // B: MOTORISTA
  { width: 13.5 }, // C: COD
  { width: 16.7 }, // D: PLACA
  { width: 20.1 }, // E: SAIDA CD
  { width: 21   }, // F: CHD LOJA
  { width: 23.5 }, // G: SAIDA LOJA
  { width: 31.5 }, // H: TEMPO EM LOJA
]

async function preencherAba(
  ws: ExcelJS.Worksheet,
  wb: ExcelJS.Workbook,
  ctx: { rede_id: string; redeNome: string; data: string; linhas: LinhaParaKpi[] },
) {
  const { rede_id, redeNome, data, linhas } = ctx

  const agrupadas = agruparPorLoja(linhas)
  const duplo = agrupadas.some(a => a.carro2 !== null)
  const nCols = duplo ? 15 : 8

  ws.columns = duplo ? COLS_DUPLO : COLS_SIMPLES

  // Row 1 — logo + fundo navy
  ws.getRow(1).height = 86.25
  for (let c = 1; c <= nCols; c++) ws.getCell(1, c).fill = FILL_NAVY
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

  // Row 2 — cabeçalho de grupo
  ws.getRow(2).height = 23.25
  for (let c = 1; c <= nCols; c++) ws.getCell(2, c).fill = FILL_NAVY

  if (duplo) {
    ws.mergeCells('B2:G2')
    const b2 = ws.getCell('B2')
    b2.value = `${redeNome} 1º CARRO`
    b2.font = FONT_HEADER; b2.fill = FILL_NAVY; b2.alignment = { horizontal: 'center', vertical: 'middle' }

    ws.mergeCells('H2:M2')
    const h2 = ws.getCell('H2')
    h2.value = `${redeNome} 2º CARRO`
    h2.font = FONT_HEADER; h2.fill = FILL_NAVY; h2.alignment = { horizontal: 'center', vertical: 'middle' }
  } else {
    ws.mergeCells('B2:H2')
    const b2 = ws.getCell('B2')
    b2.value = redeNome
    b2.font = FONT_HEADER; b2.fill = FILL_NAVY; b2.alignment = { horizontal: 'center', vertical: 'middle' }
  }

  // Row 3 — headers das colunas
  const headerRow = ws.getRow(3)
  headerRow.height = 23.25
  headerRow.values = duplo
    ? [
        'REDES / FILIAIS',
        'MOTORISTA', 'COD', 'PLACA', 'SAIDA CD', 'CHD LOJA', 'SAIDA LOJA',
        'MOTORISTA', 'COD', 'PLACA', 'SAIDA CD', 'CHD LOJA', 'SAIDA LOJA',
        'TEMPO 1º CARRO', 'TEMPO 2º CARRO',
      ]
    : ['REDES / FILIAIS', 'MOTORISTA', 'COD', 'PLACA', 'SAIDA CD', 'CHD LOJA', 'SAIDA LOJA', 'TEMPO EM LOJA']

  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = FONT_HEADER
    cell.fill = FILL_NAVY
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { left: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' } }
  })

  // Row 4 — espaçador
  ws.getRow(4).height = 23.25

  // Dados a partir da linha 5
  const lojasNoDia = [...new Set(linhas.map(l => l.loja_nome).filter(Boolean))]
  const ordemLojas = getMatrizLojas(rede_id, lojasNoDia)
  const agrupadasMap = new Map(agrupadas.map(a => [a.loja_nome, a]))

  let rowIdx = 5
  for (const loja of ordemLojas) {
    const ag = agrupadasMap.get(loja) ?? { loja_nome: loja, carro1: null, carro2: null }
    escreverLinha(ws, rowIdx, ag, duplo, nCols)
    rowIdx++
  }
}

function escreverLinha(
  ws: ExcelJS.Worksheet,
  row: number,
  ag: LinhaAgrupada,
  duplo: boolean,
  nCols: number,
) {
  const r = ws.getRow(row)
  r.height = 23.25

  const c1 = ag.carro1
  const c2 = ag.carro2

  const saida1 = toExcelTime(c1?.saida_cd)
  const chd1   = toExcelTime(c1?.chd_loja_1)
  const sai1   = toExcelTime(c1?.saida_loja_1)

  // Strip "(2º CARRO)" prefix — redundante na coluna dedicada ao 2º carro
  const nome2 = c2?.motorista?.replace(/^\(2[oº°]\s*CARRO\)\s*/i, '') ?? ''

  if (duplo) {
    const saida2 = toExcelTime(c2?.saida_cd)
    const chd2   = toExcelTime(c2?.chd_loja_1)
    const sai2   = toExcelTime(c2?.saida_loja_1)

    r.values = [
      ag.loja_nome,
      c1?.motorista ?? '', c1?.motorista_codigo ?? '', c1?.placa ?? '',
      saida1 ?? '', chd1 ?? '', sai1 ?? '',
      nome2, c2?.motorista_codigo ?? '', c2?.placa ?? '',
      saida2 ?? '', chd2 ?? '', sai2 ?? '',
      '', '',
    ]

    for (const col of [5, 6, 7, 11, 12, 13]) {
      const cell = ws.getCell(row, col)
      if (cell.value !== '') cell.numFmt = 'HH:MM'
    }

    const t1 = totalTempoMin(c1)
    if (t1 !== null) { ws.getCell(row, 14).value = t1 / 1440; ws.getCell(row, 14).numFmt = 'HH:MM' }
    const t2 = totalTempoMin(c2)
    if (t2 !== null) { ws.getCell(row, 15).value = t2 / 1440; ws.getCell(row, 15).numFmt = 'HH:MM' }
  } else {
    r.values = [
      ag.loja_nome,
      c1?.motorista ?? '', c1?.motorista_codigo ?? '', c1?.placa ?? '',
      saida1 ?? '', chd1 ?? '', sai1 ?? '',
      '',
    ]

    for (const col of [5, 6, 7]) {
      const cell = ws.getCell(row, col)
      if (cell.value !== '') cell.numFmt = 'HH:MM'
    }

    const t1 = totalTempoMin(c1)
    if (t1 !== null) { ws.getCell(row, 8).value = t1 / 1440; ws.getCell(row, 8).numFmt = 'HH:MM' }
  }

  const codigos = [...(c1?.anomalias_codigos ?? []), ...(c2?.anomalias_codigos ?? [])]
  const isAlt = (row - 5) % 2 === 1
  const bgColor = temAnomaliaHigh(codigos) ? KPI_COLORS.ANOMALIA_HIGH_BG : isAlt ? ROW_BG_ALT : ROW_BG

  r.eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum > nCols) return
    cell.font = FONT_BODY
    cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
  })
}
