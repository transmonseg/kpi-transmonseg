import ExcelJS from 'exceljs'
import type { AvisoDescasamento, LinhaKpiRomaneio, LinhaDetalheEntrega, StatusEntrega } from './types'
// Reusa a MESMA paleta/fonte/logo ja validados no relatorio da Benassi
// (pedido do usuario 25/08: "deixar esse relatorio nivel o da Benassi") --
// nunca duplica cor/asset, um unico lugar de verdade pros dois clientes.
import { KPI_COLORS, KPI_FONTS, KPI_BORDER_THIN } from '@/lib/kpi/kpi-styles'
import { getLogoBuffer } from '@/lib/kpi/template-loader'

// STATUS (OK/INCOMPLETO) removido da tela principal (pedido do usuario
// 25/08: "tira esse status de concluido ou incompleto") -- o campo `status`
// continua calculado em LinhaKpiRomaneio (agregacao.ts), so nao aparece
// mais aqui.
export const COLUNAS_KPI_ROMANEIO = [
  'CARGA', 'PLACA', 'DESTINO', 'MOTORISTA', 'AJUDANTE 1', 'AJUDANTE 2', 'PESO (KG)',
  'CLIENTES PLANEJADOS', 'NF PLANEJADO', 'PARADAS REAIS', 'KM PERCORRIDO',
  'SAÍDA CD', 'CHEGADA CD', 'TEMPO OPERAÇÃO', 'TEMPO MÉDIO POR ENTREGA',
] as const

// PLACA não entra aqui -- cada placa agora e' a PRÓPRIA aba (pedido do
// usuário 25/08: "detalhes quero abas por placa... com o estilo de kpi que
// mandei... com a chegada, saída, tempo na nota fiscal"), seria redundante
// repetir a mesma placa em toda linha de uma aba que já é só dela. COD (o
// codigo do cliente do romaneio, ver LinhaRomaneio.clienteCodigo) entra
// pra casar com a coluna "COD" do modelo de referencia
// (KPI-GUANABARA-2026-08-23-com-chegada-cd.xlsx).
// Ordem pedida pelo usuario 25/08: NF + nome do cliente logo em seguida,
// depois motorista/codigo/placa (todos "se tiver" -- ja vem string vazia
// quando falta, ver LinhaKpiRomaneio.motorista e LinhaRomaneio.clienteCodigo),
// depois o bloco de horarios na ordem exata que ele pediu (saida da base ->
// chegada na loja -> saida da loja -> chegada na base), tempo na loja e
// tempo de operacao. CARGA/ENDEREÇO/STATUS mantidos (usuario confirmou que
// sao ADITIVOS a essa lista, nao substituem).
export const COLUNAS_DETALHE_PLACA = [
  'CARGA', 'NF', 'CLIENTE', 'MOTORISTA', 'COD', 'PLACA', 'ENDEREÇO',
  'SAÍDA DA BASE', 'CHEGADA NA LOJA', 'SAÍDA DA LOJA', 'CHEGADA NA BASE',
  'TEMPO NA LOJA', 'TEMPO DE OPERAÇÃO', 'STATUS',
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

// Paleta/fonte de KPI_COLORS/KPI_FONTS (kpi-styles.ts) -- mesmo "nivel"
// visual do relatorio da Benassi: titulo branco em negrito sobre azul-
// marinho da marca, cabecalho de coluna em azul mais claro com texto
// branco, Calibri em vez da fonte padrao do Excel.
const COR_TITULO_FUNDO = KPI_COLORS.BRAND_BLUE
const COR_TITULO_TEXTO = KPI_COLORS.HEADER_TEXT
const COR_HEADER_FUNDO = KPI_COLORS.BRAND_BLUE_LIGHT
const COR_HEADER_TEXTO = KPI_COLORS.HEADER_TEXT
const FONTE = KPI_FONTS.BODY.name

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

// Achado real 25/08 (dado real da Nutry Max, reclamação "horários errados,
// tudo errado"): todo horário que chega aqui (saidaCd/chegadaCd de
// agregacao.ts, chegada/saida de Visita em visitas.ts) tem origem em
// consolidaParadasApi (unitrac-api/consolida.ts), cujo comentário já
// documenta que `_data` "já vem em BRT mascarado como UTC" -- os dígitos do
// ISO já SÃO o horário de Brasília certo, só com sufixo 'Z' mentiroso.
// Formatar com `timeZone: 'America/Sao_Paulo'` aplicava uma SEGUNDA
// conversão de fuso em cima de um valor que já não precisava de nenhuma --
// todo horário exibido no KPI saía 3h ATRASADO do real (mesmo problema que
// formatarTituloData já evita, comentário dela mesma acima). Fix: ler os
// dígitos como UTC (sem conversão), igual o resto do arquivo já faz.
function formatarHora(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
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

// Logo Transmonseg no canto esquerdo do banner de titulo -- mesmo asset
// (src/assets/transmonseg-logo.png) que o template da Benassi ja usa,
// so' que la' vem embutido no arquivo .xlsx modelo e aqui e' adicionado
// via API do ExcelJS (o gerador da Nutry Max monta o workbook do zero,
// nao carrega um template existente). Tamanho pequeno de proposito (nao
// pode competir com o titulo, que carrega informacao real -- cliente e
// data -- que a Benassi nao precisa repetir no mesmo lugar).
async function adicionarLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, linha: number): Promise<void> {
  try {
    const buffer = await getLogoBuffer()
    const imageId = wb.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: 'png' })
    ws.addImage(imageId, {
      tl: { col: 0.15, row: linha - 1 + 0.15 },
      ext: { width: 42, height: 30 },
    })
  } catch {
    // Fail-open: logo e' puramente decorativo -- se o asset nao carregar
    // por algum motivo, o relatorio sai sem logo em vez de quebrar a
    // geracao inteira.
  }
}

function estilizarTitulo(ws: ExcelJS.Worksheet, tituloLinha: number, qtdColunas: number, titulo: string): void {
  ws.mergeCells(tituloLinha, 1, tituloLinha, qtdColunas)
  const cell = ws.getCell(tituloLinha, 1)
  cell.value = titulo
  cell.font = { name: FONTE, bold: true, size: 14, color: { argb: COR_TITULO_TEXTO } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO_FUNDO } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  ws.getRow(tituloLinha).height = 32
}

// Nome de aba do Excel: máx 31 caracteres, proíbe : \ / ? * [ ]. Placa
// normalizada (ex. "TTJ9I18") já é curta e alfanumérica, mas o guard fica
// aqui pra nunca gerar um workbook corrompido se algum dia vier diferente.
const CARACTERES_PROIBIDOS_ABA = /[:\\/?*[\]]/g
function nomeAbaPlaca(placa: string): string {
  return placa.replace(CARACTERES_PROIBIDOS_ABA, '-').slice(0, 31)
}

// Linha de resumo do dia da placa (pedido do usuário 25/08: a aba por placa
// tem que ter "as informações do arquivo que mandei de exemplo" -- no
// modelo de referência MOTORISTA/SAÍDA CD/CHEGADA CD/TEMPO OPERAÇÃO são
// colunas fixas por veículo; aqui viram uma linha de resumo, já que a aba
// inteira já é dessa placa. `resumo` pode ser undefined (placa sem nenhuma
// linha agregada, caso que não deveria acontecer na prática -- toda placa
// da lista de abas vem de `linhas` -- mas o tipo permite, então trata).
function escreverResumoPlaca(ws: ExcelJS.Worksheet, linhaResumo: number, qtdColunas: number, resumo: LinhaKpiRomaneio | undefined): void {
  const texto = resumo
    ? `MOTORISTA: ${resumo.motorista || '-'}    |    SAÍDA CD: ${formatarHora(resumo.saidaCd) || '-'}    |    CHEGADA CD: ${formatarHora(resumo.chegadaCd) || '-'}    |    TEMPO OPERAÇÃO: ${formatarMinutos(resumo.tempoOperacaoMin) || '-'}    |    KM PERCORRIDO: ${resumo.kmPercorrido != null ? `${Math.round(resumo.kmPercorrido * 10) / 10} km` : '-'}`
    : ''
  ws.mergeCells(linhaResumo, 1, linhaResumo, qtdColunas)
  const cell = ws.getCell(linhaResumo, 1)
  cell.value = texto
  cell.font = { bold: true, size: 11 }
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(linhaResumo).height = 20
}

function estilizarHeader(ws: ExcelJS.Worksheet, headerLinha: number, qtdColunas: number): void {
  const row = ws.getRow(headerLinha)
  for (let c = 1; c <= qtdColunas; c++) {
    const cell = row.getCell(c)
    cell.font = { name: FONTE, bold: true, color: { argb: COR_HEADER_TEXTO } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER_FUNDO } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }
  ws.views = [{ state: 'frozen', ySplit: headerLinha }]
}

// Zebra + fonte Calibri + borda inferior sutil nas linhas de dado --
// mesma paleta BG_ZEBRA/BORDER/TEXT_DEFAULT do relatorio da Benassi
// (kpi-styles.ts), aplicada linha a linha depois do addRow (ExcelJS nao
// tem "estilo de linha alternada" nativo).
function estilizarLinhaDado(ws: ExcelJS.Worksheet, linha: number, qtdColunas: number, indice: number): void {
  const row = ws.getRow(linha)
  const zebra = indice % 2 === 1
  for (let c = 1; c <= qtdColunas; c++) {
    const cell = row.getCell(c)
    cell.font = { name: FONTE, color: { argb: KPI_COLORS.TEXT_DEFAULT } }
    if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BG_ZEBRA } }
    cell.border = KPI_BORDER_THIN
  }
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
  await adicionarLogo(wb, ws, 1)
  ws.addRow([...COLUNAS_KPI_ROMANEIO])
  estilizarHeader(ws, 2, COLUNAS_KPI_ROMANEIO.length)
  ws.columns = [
    { width: 10 }, { width: 12 }, { width: 20 }, { width: 28 }, { width: 22 }, { width: 22 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 },
    { width: 10 }, { width: 10 }, { width: 14 }, { width: 18 },
  ]

  linhas.forEach((l, i) => {
    ws.addRow([
      l.carga, l.placa, l.destino, l.motorista, l.ajudante1 ?? '', l.ajudante2 ?? '',
      l.pesoKg ?? '', l.clientesPlanejados ?? '', l.nfPlanejado ?? '', l.paradasReais,
      l.kmPercorrido != null ? Math.round(l.kmPercorrido * 10) / 10 : '',
      formatarHora(l.saidaCd), formatarHora(l.chegadaCd), formatarMinutos(l.tempoOperacaoMin),
      formatarMinutos(l.tempoMedioParadaMin),
    ])
    estilizarLinhaDado(ws, 2 + 1 + i, COLUNAS_KPI_ROMANEIO.length, i)
  })
  // Filtro nativo do Excel (pedido do usuário 24/08: "filtrável por placa")
  // -- dropdown em toda coluna, não só PLACA, é o comportamento padrão do
  // recurso e o mais útil (também dá pra filtrar por STATUS, DESTINO etc).
  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2 + linhas.length, column: COLUNAS_KPI_ROMANEIO.length },
  }

  // Uma aba por placa (pedido do usuário 25/08) -- ordem = ordem de
  // aparição na aba principal (já ordenada por carga+placa), não a ordem
  // alfabética de NF de `detalhe`. Placa sem NENHUMA entrega detalhável
  // (romaneio vazio pra ela, caso raro) ainda ganha aba, só sem linha de
  // dado -- mesmo espírito de "Avisos vazio não cria aba, mas detalhe
  // sempre existe" já usado no resto do gerador.
  const placasEmOrdem = [...new Set(linhas.map(l => l.placa))]
  // Resumo por placa: pega a PRIMEIRA linha agregada dessa placa. Caso raro
  // (placa com 2 cargas no mesmo dia) mostra só o resumo operacional da
  // primeira -- mesma simplificação já usada pra destino/motorista em
  // agregacao.ts quando falta Escala.
  const resumoPorPlaca = new Map<string, LinhaKpiRomaneio>()
  for (const l of linhas) {
    if (!resumoPorPlaca.has(l.placa)) resumoPorPlaca.set(l.placa, l)
  }
  const detalhePorPlaca = new Map<string, LinhaDetalheEntrega[]>()
  for (const d of detalhe) {
    const lista = detalhePorPlaca.get(d.placa) ?? []
    lista.push(d)
    detalhePorPlaca.set(d.placa, lista)
  }

  for (const placa of placasEmOrdem) {
    const wsPlaca = wb.addWorksheet(nomeAbaPlaca(placa))
    const tituloPlaca = `RELATÓRIO KPI - NUTRY MAX - PLACA ${placa}\n${formatarTituloData(data)}`
    estilizarTitulo(wsPlaca, 1, COLUNAS_DETALHE_PLACA.length, tituloPlaca)
    await adicionarLogo(wb, wsPlaca, 1)
    escreverResumoPlaca(wsPlaca, 2, COLUNAS_DETALHE_PLACA.length, resumoPorPlaca.get(placa))
    wsPlaca.addRow([...COLUNAS_DETALHE_PLACA])
    estilizarHeader(wsPlaca, 3, COLUNAS_DETALHE_PLACA.length)
    wsPlaca.columns = [
      { width: 10 }, { width: 14 }, { width: 32 }, { width: 22 }, { width: 10 }, { width: 12 }, { width: 36 },
      { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 16 }, { width: 20 },
    ]
    const linhasDaPlaca = detalhePorPlaca.get(placa) ?? []
    linhasDaPlaca.forEach((d, i) => {
      wsPlaca.addRow([
        d.carga, d.nf, d.clienteNome, d.motorista, d.clienteCodigo, d.placa, d.endereco,
        formatarHora(d.saidaCd), formatarHora(d.chegada), formatarHora(d.saida), formatarHora(d.chegadaCd),
        formatarMinutos(d.tempoParadaMin), formatarMinutos(d.tempoOperacaoMin),
        LABEL_STATUS_ENTREGA[d.status],
      ])
      estilizarLinhaDado(wsPlaca, 3 + 1 + i, COLUNAS_DETALHE_PLACA.length, i)
    })
    wsPlaca.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3 + linhasDaPlaca.length, column: COLUNAS_DETALHE_PLACA.length },
    }
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
