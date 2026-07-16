import ExcelJS from 'exceljs'
import { getLogoBuffer } from '@/lib/kpi/template-loader'
import type { RelatorioPlacaNutrimax } from './types'

// Mesmas cores do template aprovado do KPI Benassi (src/assets/kpi-template.xlsx) —
// faixa de título FF153C6B, cabeçalho de tabela num azul mais claro.
const COR_TITULO = 'FF153C6B'
const COR_HEADER_TABELA = 'FF2E75B6'
const COR_BG_ALT = 'FFF8FAFC'
const COR_OK_BG = 'FFD1FAE5'
const COR_OK_TXT = 'FF065F46'
const COR_DIVERGENTE_BG = 'FFFEF3C7'
const COR_DIVERGENTE_TXT = 'FF92400E'
const COR_AUSENTE_BG = 'FFFEE2E2'
const COR_AUSENTE_TXT = 'FF991B1B'

const STATUS_LABEL: Record<RelatorioPlacaNutrimax['status'], string> = {
  ok: 'OK',
  divergente: 'DIVERGENTE',
  ausente: 'AUSENTE',
}

const STATUS_COR: Record<RelatorioPlacaNutrimax['status'], { bg: string; txt: string }> = {
  ok: { bg: COR_OK_BG, txt: COR_OK_TXT },
  divergente: { bg: COR_DIVERGENTE_BG, txt: COR_DIVERGENTE_TXT },
  ausente: { bg: COR_AUSENTE_BG, txt: COR_AUSENTE_TXT },
}

function sanitizaNomeAba(nome: string): string {
  return nome.replace(/[\\/?*[\]:]/g, '-').slice(0, 31)
}

function nomeUnicoAba(usados: Set<string>, base: string): string {
  let nome = sanitizaNomeAba(base)
  let i = 2
  while (usados.has(nome)) {
    nome = sanitizaNomeAba(`${base} (${i})`)
    i++
  }
  usados.add(nome)
  return nome
}

/** Fração do dia (formato de hora nativo do Excel) a partir de um ISO — mesma
 *  técnica do gerador do Benassi (gerador-kpi.ts:toExcelTime). Sem isso, a
 *  hora vira texto solto em vez de um valor de hora de verdade (alinhamento,
 *  numFmt e ordenação do Excel dependem disso). */
function toExcelTime(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  return (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400
}

/** Aplica valor de hora + numFmt numa célula de uma linha chave/valor
 *  (cabeçalho por placa: coluna 2) ou de tabela (coluna variável). */
function setCelulaHora(cell: ExcelJS.Cell, iso: string | null) {
  const t = toExcelTime(iso)
  cell.value = t ?? ''
  if (t !== null) { cell.numFmt = 'h:mm'; cell.alignment = { horizontal: 'center' } }
}

/** Faixa de marca (logo + título navy + subtítulo) nas 2 primeiras linhas da aba —
 *  mesmo padrão visual do template aprovado do KPI Benassi. Conteúdo real da aba
 *  começa na linha 3. */
function aplicarCabecalhoDeMarca(
  ws: ExcelJS.Worksheet,
  imageId: number,
  titulo: string,
  subtitulo: string,
  ultimaColuna: number,
) {
  ws.mergeCells(1, 1, 1, ultimaColuna)
  const t = ws.getCell(1, 1)
  t.value = titulo
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO } }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 34

  ws.addImage(imageId, { tl: { col: 0.05, row: 0.05 }, ext: { width: 60, height: 43 } })

  ws.mergeCells(2, 1, 2, ultimaColuna)
  const s = ws.getCell(2, 1)
  s.value = subtitulo
  s.font = { italic: true, size: 10, color: { argb: 'FF475569' } }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } }
  s.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18
}

function estilizaHeaderTabela(row: ExcelJS.Row) {
  row.eachCell(cell => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER_TABELA } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  row.height = 22
}

function pintaStatusCell(cell: ExcelJS.Cell, status: RelatorioPlacaNutrimax['status']) {
  const cor = STATUS_COR[status]
  cell.font = { bold: true, size: 10, color: { argb: cor.txt } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor.bg } }
  cell.alignment = { horizontal: 'center' }
}

function pintaConfirmacaoCell(cell: ExcelJS.Cell, confirmado: boolean) {
  cell.font = { bold: true, size: 10, color: { argb: confirmado ? COR_OK_TXT : COR_DIVERGENTE_TXT } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: confirmado ? COR_OK_BG : COR_DIVERGENTE_BG } }
  cell.alignment = { horizontal: 'center' }
}

export async function gerarRomaneioConferencia(relatorio: RelatorioPlacaNutrimax[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()

  const logoBuf = await getLogoBuffer()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageId = wb.addImage({ buffer: logoBuf as any, extension: 'png' })

  // Nomes das abas decididos ANTES de desenhar o Resumo, pra poder linkar cada
  // linha direto pra aba da placa correspondente.
  const usados = new Set<string>(['Resumo'])
  const nomesAba = relatorio.map(r => nomeUnicoAba(usados, `${r.placaNorm} (${r.carga})`))

  const resumo = wb.addWorksheet('Resumo')
  resumo.views = [{ state: 'frozen', ySplit: 3 }]
  resumo.columns = [
    { width: 12 }, { width: 14 }, { width: 26 }, { width: 12 }, { width: 12 },
    { width: 10 }, { width: 10 }, { width: 13 }, { width: 14 },
  ]
  aplicarCabecalhoDeMarca(resumo, imageId, 'ROMANEIO NUTRY — CONFERÊNCIA', `${relatorio.length} carga(s) na escala`, 9)
  const headerResumo = resumo.addRow(['CARGA', 'PLACA', 'DESTINO', 'PESO (KG)', 'CLIENTES', 'NFS', 'KM', 'PARADAS GPS', 'STATUS'])
  estilizaHeaderTabela(headerResumo)
  let pesoTotal = 0
  let kmTotal = 0
  relatorio.forEach((r, i) => {
    pesoTotal += r.pesoKg ?? 0
    kmTotal += r.kmPercorrido ?? 0
    const row = resumo.addRow([
      r.carga,
      r.placaNorm,
      r.destino,
      r.pesoKg ?? '',
      `${r.entRecebido}/${r.entPlanejado ?? '—'}`,
      `${r.nfRecebido}/${r.nfPlanejado ?? '—'}`,
      r.kmPercorrido ?? '',
      r.qtdParadasReal,
      STATUS_LABEL[r.status],
    ])
    if (i % 2 === 1) {
      row.eachCell((cell, col) => { if (col < 9) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } } })
    }
    row.getCell(2).value = { text: r.placaNorm, hyperlink: `#'${nomesAba[i]}'!A1` }
    row.getCell(2).font = { color: { argb: 'FF1F4E78' }, underline: true }
    pintaStatusCell(row.getCell(9), r.status)
  })
  if (relatorio.length > 0) {
    const totalRow = resumo.addRow(['TOTAL', '', '', pesoTotal, '', '', Math.round(kmTotal * 10) / 10, '', ''])
    totalRow.font = { bold: true }
    totalRow.eachCell(cell => { cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } } })
  }

  relatorio.forEach((r, i) => {
    const ws = wb.addWorksheet(nomesAba[i])
    ws.properties.tabColor = { argb: STATUS_COR[r.status].txt }
    ws.columns = [{ width: 18 }, { width: 32 }, { width: 40 }, { width: 16 }, { width: 11 }, { width: 9 }]
    aplicarCabecalhoDeMarca(ws, imageId, `${r.placaNorm} — CARGA ${r.carga}`, r.destino, 6)

    ws.addRow(['CARGA', r.carga])
    ws.addRow(['PLACA', r.placaNorm])
    ws.addRow(['DESTINO', r.destino])
    ws.addRow(['MOTORISTA', r.motorista])
    ws.addRow(['AJUDANTE 1', r.ajudante1 ?? ''])
    ws.addRow(['AJUDANTE 2', r.ajudante2 ?? ''])
    ws.addRow(['PESO (KG)', r.pesoKg ?? ''])
    ws.addRow(['KM PERCORRIDO', r.kmPercorrido ?? ''])
    const inicioRow = ws.addRow(['INÍCIO VIAGEM', ''])
    setCelulaHora(inicioRow.getCell(2), r.inicioViagem)
    const fimRow = ws.addRow(['FIM VIAGEM', ''])
    setCelulaHora(fimRow.getCell(2), r.fimViagem)
    ws.addRow(['CLIENTES (ENT)', `${r.entRecebido} / ${r.entPlanejado ?? '—'}`])
    ws.addRow(['NF', `${r.nfRecebido} / ${r.nfPlanejado ?? '—'}`])
    const statusRow = ws.addRow(['STATUS', STATUS_LABEL[r.status]])
    pintaStatusCell(statusRow.getCell(2), r.status)
    ws.addRow([])

    const headerClientes = ws.addRow(['NF', 'CLIENTE', 'ENDEREÇO', 'CONFIRMADO GPS', 'CHEGADA', 'KM'])
    estilizaHeaderTabela(headerClientes)
    r.clientes.forEach((c, ci) => {
      const row = ws.addRow([
        c.nf,
        c.clienteNome,
        c.endereco ?? '',
        c.parada ? 'SIM' : 'NÃO',
        '',
        c.parada?.distanciaKm ?? '',
      ])
      setCelulaHora(row.getCell(5), c.parada?.chegada ?? null)
      if (ci % 2 === 1) {
        row.eachCell((cell, col) => { if (col < 4) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } } })
      }
      pintaConfirmacaoCell(row.getCell(4), c.parada !== null)
    })

    if (r.paradasSemCliente.length > 0) {
      ws.addRow([])
      const titulo = ws.addRow(['PARADAS SEM CLIENTE IDENTIFICADO'])
      titulo.font = { bold: true, size: 11, color: { argb: COR_DIVERGENTE_TXT } }
      const headerSemCliente = ws.addRow(['LOCAL', 'CHEGADA', 'KM'])
      estilizaHeaderTabela(headerSemCliente)
      r.paradasSemCliente.forEach((p, pi) => {
        const row = ws.addRow([p.localParada, '', p.distanciaKm ?? ''])
        setCelulaHora(row.getCell(2), p.chegada)
        if (pi % 2 === 1) {
          row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } } })
        }
      })
    }
  })

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
