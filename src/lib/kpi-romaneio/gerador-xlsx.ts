import ExcelJS from 'exceljs'
import type { AvisoDescasamento, LinhaKpiRomaneio, LinhaDetalheEntrega, StatusEntrega } from './types'

export const COLUNAS_KPI_ROMANEIO = [
  'CARGA', 'PLACA', 'DESTINO', 'MOTORISTA', 'AJUDANTE 1', 'AJUDANTE 2', 'PESO (KG)',
  'CLIENTES PLANEJADOS', 'NF PLANEJADO', 'PARADAS REAIS', 'KM PERCORRIDO',
  'SAÍDA CD', 'CHEGADA CD', 'TEMPO OPERAÇÃO', 'TEMPO MÉDIO POR ENTREGA', 'STATUS',
] as const

export const COLUNAS_DETALHAMENTO = [
  'CARGA', 'PLACA', 'NF', 'CLIENTE', 'ENDEREÇO', 'CHEGADA', 'SAÍDA', 'TEMPO NA PARADA', 'STATUS',
] as const

export const COLUNAS_AVISOS = ['CARGA', 'PLACA', 'PROBLEMA'] as const

const LABEL_MOTIVO: Record<AvisoDescasamento['motivo'], string> = {
  sem_romaneio: 'sem romaneio',
  sem_escala: 'sem escala',
}

const LABEL_STATUS_ENTREGA: Record<StatusEntrega, string> = {
  confirmado_unitrac: 'CONFIRMADO (UNITRAC)',
  confirmado_gps: 'CONFIRMADO (GPS)',
  pendente: 'PENDENTE',
}

// Mesma paleta do modelo de referência que o usuário usa hoje
// (KPI-GUANABARA-*.xlsx, banner "RELATÓRIO KPI - <CLIENTE>"): título branco
// em negrito sobre fundo azul-marinho, cabeçalho de coluna em cinza claro.
const COR_TITULO_FUNDO = 'FF153C6B'
const COR_TITULO_TEXTO = 'FFFFFFFF'
const COR_HEADER_FUNDO = 'FFD9E1F2'

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado',
] as const
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const

/** "2026-08-24" -> "Segunda-feira, 24 de Agosto de 2026" -- mesmo estilo do
 *  banner de título da amostra de referência. Usa meio-dia UTC pra nunca
 *  cruzar fronteira de dia por fuso (a data já vem como "hoje" no calendário
 *  BRT, não precisa de conversão de fuso aqui). */
function formatarTituloData(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia, 12))
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${String(dia).padStart(2, '0')} de ${MESES[mes - 1]} de ${ano}`
}

function formatarHora(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

function formatarMinutos(min: number | null): string {
  // Achado real 24/08: minutos negativos (chegada antes da saída, por bug de
  // dado upstream) geravam "-1h-1min" via Math.floor/`%` com sinal em JS --
  // a defesa real é nunca deixar tempoOperacaoMin ficar negativo na origem
  // (ver agregacao.ts), mas o formatador tambem nunca deve fingir que sabe
  // formatar um valor que nao devia existir.
  if (min == null || min < 0) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${String(m).padStart(2, '0')}min`
}

function estilizarTitulo(ws: ExcelJS.Worksheet, tituloLinha: number, qtdColunas: number, titulo: string): void {
  ws.mergeCells(tituloLinha, 1, tituloLinha, qtdColunas)
  const cell = ws.getCell(tituloLinha, 1)
  cell.value = titulo
  cell.font = { bold: true, size: 14, color: { argb: COR_TITULO_TEXTO } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO_FUNDO } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  ws.getRow(tituloLinha).height = 32
}

function estilizarHeader(ws: ExcelJS.Worksheet, headerLinha: number, qtdColunas: number): void {
  const row = ws.getRow(headerLinha)
  for (let c = 1; c <= qtdColunas; c++) {
    const cell = row.getCell(c)
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER_FUNDO } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }
  ws.views = [{ state: 'frozen', ySplit: headerLinha }]
}

/** Terceiro parametro e' aditivo -- avisos de descasamento Escala<->Romaneio
 *  (ver spec, secao "Tratamento de erro/ambiguidade"). Lista vazia (default)
 *  nao cria a aba "Avisos": decisao de nao poluir o arquivo com uma aba
 *  vazia todo dia em que nao houve nenhum descasamento -- so aparece
 *  quando ha algo pra avisar.
 *
 *  Quarto parametro (pedido do usuario 24/08, referencia
 *  KPI-GUANABARA-2026-08-23-com-chegada-cd.xlsx): alem do resumo por carga,
 *  uma aba "Detalhamento" com uma linha por NF/entrega -- lista vazia
 *  (default) ainda cria a aba, só sem linhas de dado (diferente de Avisos:
 *  o usuario quer essa aba sempre visivel, mesmo dia sem nenhuma entrega
 *  detalhavel). */
export async function gerarKpiRomaneioXlsx(
  linhas: LinhaKpiRomaneio[],
  data: string,
  avisos: AvisoDescasamento[] = [],
  detalhe: LinhaDetalheEntrega[] = [],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()
  const titulo = `RELATÓRIO KPI - NUTRY MAX\n${formatarTituloData(data)}`

  const ws = wb.addWorksheet(`KPI ${data}`)
  estilizarTitulo(ws, 1, COLUNAS_KPI_ROMANEIO.length, titulo)
  ws.addRow([...COLUNAS_KPI_ROMANEIO])
  estilizarHeader(ws, 2, COLUNAS_KPI_ROMANEIO.length)
  ws.columns = [
    { width: 10 }, { width: 12 }, { width: 20 }, { width: 28 }, { width: 22 }, { width: 22 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 },
    { width: 10 }, { width: 10 }, { width: 14 }, { width: 18 }, { width: 12 },
  ]

  for (const l of linhas) {
    ws.addRow([
      l.carga, l.placa, l.destino, l.motorista, l.ajudante1 ?? '', l.ajudante2 ?? '',
      l.pesoKg ?? '', l.clientesPlanejados ?? '', l.nfPlanejado ?? '', l.paradasReais,
      l.kmPercorrido != null ? Math.round(l.kmPercorrido * 10) / 10 : '',
      formatarHora(l.saidaCd), formatarHora(l.chegadaCd), formatarMinutos(l.tempoOperacaoMin),
      formatarMinutos(l.tempoMedioParadaMin),
      l.status,
    ])
  }
  // Filtro nativo do Excel (pedido do usuário 24/08: "filtrável por placa")
  // -- dropdown em toda coluna, não só PLACA, é o comportamento padrão do
  // recurso e o mais útil (também dá pra filtrar por STATUS, DESTINO etc).
  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2 + linhas.length, column: COLUNAS_KPI_ROMANEIO.length },
  }

  const wsDetalhe = wb.addWorksheet('Detalhamento')
  estilizarTitulo(wsDetalhe, 1, COLUNAS_DETALHAMENTO.length, titulo)
  wsDetalhe.addRow([...COLUNAS_DETALHAMENTO])
  estilizarHeader(wsDetalhe, 2, COLUNAS_DETALHAMENTO.length)
  wsDetalhe.columns = [
    { width: 10 }, { width: 12 }, { width: 14 }, { width: 32 }, { width: 36 },
    { width: 10 }, { width: 10 }, { width: 16 }, { width: 20 },
  ]
  for (const d of detalhe) {
    wsDetalhe.addRow([
      d.carga, d.placa, d.nf, d.clienteNome, d.endereco,
      formatarHora(d.chegada), formatarHora(d.saida), formatarMinutos(d.tempoParadaMin),
      LABEL_STATUS_ENTREGA[d.status],
    ])
  }
  wsDetalhe.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2 + detalhe.length, column: COLUNAS_DETALHAMENTO.length },
  }

  if (avisos.length > 0) {
    const wsAvisos = wb.addWorksheet('Avisos')
    wsAvisos.addRow([...COLUNAS_AVISOS])
    for (const a of avisos) {
      wsAvisos.addRow([a.carga, a.placa, LABEL_MOTIVO[a.motivo]])
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
