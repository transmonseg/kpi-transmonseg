import ExcelJS from 'exceljs'
import { getLogoBuffer } from '@/lib/kpi/template-loader'
import { formataDataPtBr } from '@/lib/kpi/kpi-styles'
import type { KpiViagemNutrimax } from './types'

// Mesmas cores do template aprovado do KPI Benassi.
const COR_TITULO = 'FF153C6B'
const COR_HEADER_TABELA = 'FF2E75B6'
const COR_BG_ALT = 'FFF8FAFC'
const COR_OK_BG = 'FFD1FAE5'
const COR_OK_TXT = 'FF065F46'
const COR_INCOMPLETO_BG = 'FFFEF3C7'
const COR_INCOMPLETO_TXT = 'FF92400E'
const COR_SEM_RASTREADOR_BG = 'FFFEE2E2'
const COR_SEM_RASTREADOR_TXT = 'FF991B1B'

const STATUS_LABEL: Record<KpiViagemNutrimax['status'], string> = {
  ok: 'OK',
  incompleto: 'INCOMPLETO',
  sem_rastreador: 'SEM RASTREADOR',
}

const STATUS_COR: Record<KpiViagemNutrimax['status'], { bg: string; txt: string }> = {
  ok: { bg: COR_OK_BG, txt: COR_OK_TXT },
  incompleto: { bg: COR_INCOMPLETO_BG, txt: COR_INCOMPLETO_TXT },
  sem_rastreador: { bg: COR_SEM_RASTREADOR_BG, txt: COR_SEM_RASTREADOR_TXT },
}

const COL_SAIDA_CD = 12
const COL_CHEGADA_CD = 13
const COL_TEMPO_OPERACAO = 14

// Mesmos nomes de coluna do KPI Benassi pro que tem equivalente direto
// (SAÍDA CD/CHEGADA CD = saída/volta ao CD; TEMPO OPERAÇÃO = duração da
// viagem). CHD LOJA/SAÍDA LOJA/TEMPO EM LOJA do Benassi não têm equivalente
// aqui — lá é por loja única; na Nutry Max uma carga visita dezenas de
// clientes, não uma loja só.
const COLUNAS = [
  'CARGA', 'PLACA', 'DESTINO', 'MOTORISTA', 'AJUDANTE 1', 'AJUDANTE 2', 'PESO (KG)',
  'CLIENTES PLANEJADOS', 'NF PLANEJADO', 'PARADAS REAIS', 'KM PERCORRIDO',
  'SAÍDA CD', 'CHEGADA CD', 'TEMPO OPERAÇÃO', 'STATUS',
] as const

/** Fração do dia (formato de hora nativo do Excel) a partir de um ISO —
 *  mesma técnica do gerador do Benassi (gerador-kpi.ts:toExcelTime). Sem
 *  isso, a hora vira texto solto em vez de um valor de hora de verdade
 *  (alinhamento, numFmt e ordenação do Excel dependem disso). */
function toExcelTime(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  return (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400
}

/** Duração SAÍDA CD → CHEGADA CD como fração do dia, mesma semântica de
 *  calcTempoOperacao do Benassi (gerador-kpi.ts). */
function toExcelTempoOperacao(inicioIso: string | null, fimIso: string | null): number | null {
  if (!inicioIso || !fimIso) return null
  let min = Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60000)
  if (min < 0) min += 1440
  return min / 1440
}

export async function gerarKpiViagemXlsx(kpi: KpiViagemNutrimax[], data: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()

  const logoBuf = await getLogoBuffer()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageId = wb.addImage({ buffer: logoBuf as any, extension: 'png' })

  const [, mesIso, diaIso] = data.split('-')
  const ws = wb.addWorksheet(`${diaIso}.${mesIso}`)
  ws.columns = [
    { width: 10 }, { width: 12 }, { width: 22 }, { width: 26 }, { width: 22 }, { width: 22 },
    { width: 12 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 13 },
    { width: 11 }, { width: 11 }, { width: 14 }, { width: 16 },
  ]

  ws.mergeCells(1, 1, 1, COLUNAS.length)
  const titulo = ws.getCell(1, 1)
  titulo.value = 'RELATÓRIO KPI - NUTRY MAX'
  titulo.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO } }
  titulo.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 34
  ws.addImage(imageId, { tl: { col: 0.05, row: 0.05 }, ext: { width: 60, height: 43 } })

  ws.mergeCells(2, 1, 2, COLUNAS.length)
  const subtitulo = ws.getCell(2, 1)
  subtitulo.value = `${formataDataPtBr(data)} — ${kpi.length} carga(s) — planejado (Escala) x realizado (Relatório Parada e Serviço)`
  subtitulo.font = { italic: true, size: 10, color: { argb: 'FF475569' } }
  subtitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } }
  subtitulo.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18

  const header = ws.addRow([...COLUNAS])
  header.eachCell(cell => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER_TABELA } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  header.height = 22

  let pesoTotal = 0
  let kmTotal = 0
  kpi.forEach((k, i) => {
    pesoTotal += k.pesoKg ?? 0
    kmTotal += k.kmPercorrido ?? 0
    const row = ws.addRow([
      k.carga, k.placaNorm, k.destino, k.motorista, k.ajudante1 ?? '', k.ajudante2 ?? '',
      k.pesoKg ?? '', k.entPlanejado ?? '', k.nfPlanejado ?? '', k.qtdParadasReal, k.kmPercorrido ?? '',
      toExcelTime(k.inicioViagem) ?? '', toExcelTime(k.fimViagem) ?? '',
      toExcelTempoOperacao(k.inicioViagem, k.fimViagem) ?? '', STATUS_LABEL[k.status],
    ])
    if (i % 2 === 1) {
      row.eachCell((cell, col) => { if (col < COLUNAS.length) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } } })
    }
    for (const col of [COL_SAIDA_CD, COL_CHEGADA_CD, COL_TEMPO_OPERACAO]) {
      const cell = row.getCell(col)
      if (typeof cell.value === 'number') { cell.numFmt = 'h:mm'; cell.alignment = { horizontal: 'center' } }
    }
    const cor = STATUS_COR[k.status]
    const statusCell = row.getCell(COLUNAS.length)
    statusCell.font = { bold: true, size: 10, color: { argb: cor.txt } }
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor.bg } }
    statusCell.alignment = { horizontal: 'center' }
  })

  if (kpi.length > 0) {
    const totalRow = ws.addRow(['TOTAL', '', '', '', '', '', pesoTotal, '', '', '', Math.round(kmTotal * 10) / 10, '', '', '', ''])
    totalRow.font = { bold: true }
    totalRow.eachCell(cell => { cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } } })
  }

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
