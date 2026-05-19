import ExcelJS from 'exceljs'
import type { KpiLinha } from '@/lib/types/kpi'
import { KPI_COLORS, REDE_NOMES_CANONICOS } from './kpi-styles'
import { carregarOuCriarWorkbook, nomeAbaDoDia } from './template-loader'
import { getMatrizLojas, resolverNomeCanonico } from '@/lib/lojas/catalogo-matriz'
import { temAnomaliaHigh } from './anomalia-obs'
import { agruparPorLoja, type LinhaAgrupada } from './agrupar-por-loja'

/** Linha enriquecida com info que não está no schema kpi_linhas. */
export interface LinhaParaKpi extends KpiLinha {
  motorista_codigo?: number | string | null
}

export interface GerarKpiInput {
  rede_id: string
  data: string
  linhas: LinhaParaKpi[]
  arquivoExistente?: Buffer | null
}

function toExcelTime(d: Date | null | undefined): number | null {
  if (!d) return null
  // Parsers armazenam BRT como Date.UTC(...) — usar getUTCHours direto sem reconverter
  return (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400
}

function formatarPlacaDisplay(placa: string | null | undefined): string {
  if (!placa) return ''
  const norm = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  if (norm.length !== 7) return placa
  return `${norm.slice(0, 3)}-${norm.slice(3)}`
}

export async function gerarKpi(input: GerarKpiInput): Promise<Buffer> {
  const { rede_id, data, linhas, arquivoExistente } = input
  const wb = await carregarOuCriarWorkbook(arquivoExistente ?? null)
  const nomeAba = nomeAbaDoDia(data)
  const redeNome = REDE_NOMES_CANONICOS[rede_id] ?? rede_id

  const abaExistente = wb.getWorksheet(nomeAba)
  if (abaExistente) wb.removeWorksheet(abaExistente.id)

  const ws = wb.addWorksheet(nomeAba, { views: [{ state: 'frozen', ySplit: 4 }] })
  preencherAba(ws, { rede_id, redeNome, linhas })

  if (rede_id === 'ZONA_SUL') {
    const { gerarAbaBaseZonaSul } = await import('./zona-sul-base')
    gerarAbaBaseZonaSul(wb)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from(await wb.xlsx.writeBuffer() as any) as any
}

const NAVY        = 'FF1F3864'
const ROW_BG      = 'FFFFFFCC'
const ROW_BG_ALT  = 'FFFFFFFF'
const SPACER_BG   = 'FFFFFFCC'

const FONT_TITLE     = { name: 'Arial',        size: 48, bold: true, color: { argb: 'FFFFFFFF' } }
const FONT_GROUP     = { name: 'Arial',        size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
const FONT_HEADER    = { name: 'Arial Narrow', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
const FONT_BODY      = { name: 'Arial',        size: 12, color: { argb: 'FF000000' } }
const FILL_NAVY      = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: NAVY } }
const FILL_SPACER    = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: SPACER_BG } }
const NUMFMT_TIME    = 'h:mm;@'
const NUMFMT_HEADER  = '[$-F400]h:mm:ss AM/PM'

const COLS_15 = [
  { width: 44.5703125 },  // A: REDES/FILIAIS
  { width: 23.85546875 }, // B: MOTORISTA 1
  { width: 13.5703125 },  // C: COD 1
  { width: 16.7109375 },  // D: PLACA 1
  { width: 20.140625 },   // E: SAIDA CD 1
  { width: 21 },          // F: CHD LOJA 1
  { width: 23.5 },        // G: SAIDA LOJA 1
  { width: 23.85546875 }, // H: MOTORISTA 2
  { width: 13.5703125 },  // I: COD 2
  { width: 16.7109375 },  // J: PLACA 2
  { width: 20.140625 },   // K: SAIDA CD 2
  { width: 21 },          // L: CHD LOJA 2
  { width: 23.5 },        // M: SAIDA LOJA 2
  { width: 31.5 },        // N: TEMPO EM LOJA 1
  { width: 31.5 },        // O: TEMPO EM LOJA 2
]

const N_COLS = 15

function preencherAba(
  ws: ExcelJS.Worksheet,
  ctx: { rede_id: string; redeNome: string; linhas: LinhaParaKpi[] },
) {
  const { rede_id, redeNome, linhas: linhasRaw } = ctx

  // Renomeia lojas da escala para nome canônico do catálogo
  const linhas = linhasRaw.map(l => {
    const canon = resolverNomeCanonico(rede_id, l.loja_nome)
    return canon ? { ...l, loja_nome: canon } : l
  })

  const agrupadas = agruparPorLoja(linhas)
  ws.columns = COLS_15

  // Row 1 — título textual
  ws.getRow(1).height = 110
  ws.mergeCells('A1:O1')
  const titleCell = ws.getCell('A1')
  titleCell.value = `RELATÓRIO KPI - ${redeNome.toUpperCase()}\nBENASSI`
  titleCell.font = FONT_TITLE
  titleCell.fill = FILL_NAVY
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

  // Row 2 — cabeçalho de grupo
  ws.getRow(2).height = 23.25
  for (let c = 1; c <= N_COLS; c++) ws.getCell(2, c).fill = FILL_NAVY
  ws.mergeCells('B2:G2')
  const b2 = ws.getCell('B2')
  b2.value = `${redeNome.toUpperCase()} 1º CARRO`
  b2.font = FONT_GROUP
  b2.fill = FILL_NAVY
  b2.alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells('H2:M2')
  const h2 = ws.getCell('H2')
  h2.value = `${redeNome.toUpperCase()} 2º CARRO`
  h2.font = FONT_GROUP
  h2.fill = FILL_NAVY
  h2.alignment = { horizontal: 'center', vertical: 'middle' }

  // Row 3 — headers das colunas
  const headerRow = ws.getRow(3)
  headerRow.height = 23.25
  headerRow.values = [
    'REDES / FILIAIS',
    'MOTORISTA', 'COD', 'PLACA', 'SAIDA CD', 'CHD LOJA', 'SAIDA LOJA',
    'MOTORISTA', 'COD', 'PLACA', 'SAIDA CD', 'CHD LOJA', 'SAIDA LOJA',
    'TEMPO EM LOJA 1', 'TEMPO EM LOJA 2',
  ]
  headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum > N_COLS) return
    cell.font = FONT_HEADER
    cell.fill = FILL_NAVY
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { left: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' } }
    cell.numFmt = NUMFMT_HEADER
  })

  // Row 4 — espaçador estilizado
  const spacerRow = ws.getRow(4)
  spacerRow.height = 23.25
  for (let c = 1; c <= N_COLS; c++) {
    const cell = ws.getCell(4, c)
    cell.fill = FILL_SPACER
    cell.font = { name: 'Arial', size: 12 }
    cell.numFmt = NUMFMT_TIME
    cell.border = {
      top:    { style: 'thin', color: { argb: 'FFB0B0B0' } },
      bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      left:   { style: 'thin', color: { argb: 'FFB0B0B0' } },
      right:  { style: 'thin', color: { argb: 'FFB0B0B0' } },
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  }

  // Dados a partir da linha 5
  const lojasNoDia = [...new Set(linhas.map(l => l.loja_nome).filter(Boolean))]
  const ordemLojas = getMatrizLojas(rede_id, lojasNoDia)
  const agrupadasMap = new Map(agrupadas.map(a => [a.loja_nome, a]))

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

  // Veículo existe na escala mas sem nenhuma parada GPS registrada
  const semGps1 = c1 !== null && c1.saida_cd === null && c1.chd_loja_1 === null && c1.saida_loja_1 === null
  const semGps2 = c2 !== null && c2.saida_cd === null && c2.chd_loja_1 === null && c2.saida_loja_1 === null
  // Tem GPS (saiu do CD) mas não foi a esta loja específica
  const naoFoi1 = c1 !== null && !semGps1 && c1.chd_loja_1 === null
  const naoFoi2 = c2 !== null && !semGps2 && c2.chd_loja_1 === null

  const saida1 = toExcelTime(c1?.saida_cd)
  const chd1   = toExcelTime(c1?.chd_loja_1)
  const sai1   = toExcelTime(c1?.saida_loja_1)
  const saida2 = toExcelTime(c2?.saida_cd)
  const chd2   = toExcelTime(c2?.chd_loja_1)
  const sai2   = toExcelTime(c2?.saida_loja_1)

  const textoSlot1 = naoFoi1 ? 'NÃO FOI AO CLIENTE' : semGps1 ? 'SEM RASTREADOR' : null
  const textoSlot2 = naoFoi2 ? 'NÃO FOI AO CLIENTE' : semGps2 ? 'SEM RASTREADOR' : null

  // Strip "(2º CARRO)" prefix — redundante na coluna dedicada ao 2º carro
  const nome2 = c2?.motorista?.replace(/^\(2[oº°]\s*CARRO\)\s*/i, '') ?? ''

  r.values = [
    ag.loja_nome,
    c1?.motorista ?? '', c1?.motorista_codigo ?? '', formatarPlacaDisplay(c1?.placa),
    textoSlot1 ?? (saida1 ?? ''),
    textoSlot1 ?? (chd1 ?? ''),
    textoSlot1 ?? (sai1 ?? ''),
    nome2, c2?.motorista_codigo ?? '', formatarPlacaDisplay(c2?.placa),
    textoSlot2 ?? (saida2 ?? ''),
    textoSlot2 ?? (chd2 ?? ''),
    textoSlot2 ?? (sai2 ?? ''),
    '', '',
  ]

  for (const col of [5, 6, 7, 11, 12, 13]) {
    const cell = ws.getCell(row, col)
    if (typeof cell.value === 'number') cell.numFmt = NUMFMT_TIME
  }

  // Fórmulas TEMPO EM LOJA — sempre, mesmo em linhas vazias (igual manual)
  ws.getCell(row, 14).value = { formula: `MOD(G${row}-F${row},1)` }
  ws.getCell(row, 14).numFmt = NUMFMT_TIME
  ws.getCell(row, 15).value = { formula: `MOD(M${row}-L${row},1)` }
  ws.getCell(row, 15).numFmt = NUMFMT_TIME

  const codigos = [...(c1?.anomalias_codigos ?? []), ...(c2?.anomalias_codigos ?? [])]
  const isAlt = (row - 5) % 2 === 1
  const bgColor = temAnomaliaHigh(codigos) ? KPI_COLORS.ANOMALIA_HIGH_BG : isAlt ? ROW_BG_ALT : ROW_BG

  r.eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum > N_COLS) return
    cell.font = FONT_BODY
    cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left:   { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right:  { style: 'thin', color: { argb: 'FFD0D0D0' } },
    }
  })
}
