// Dashboard de performance/ranking de motoristas -- pedido do usuario 06/09
// (a Nutry Max mandou um modelo proprio, "controle de frota", com ranking
// diario e semanal por equipe). Ver dashboard.ts pra logica pura (ja'
// validada contra os numeros reais do arquivo da cliente). Este arquivo so'
// desenha o xlsx -- mesma paleta/fonte do relatorio de confirmacao
// (kpi-styles.ts), pra sair com a cara dos outros relatorios do sistema.
import ExcelJS from 'exceljs'
import { KPI_COLORS, KPI_FONTS, KPI_BORDER_THIN } from '@/lib/kpi/kpi-styles'
import { getLogoBuffer } from '@/lib/kpi/template-loader'
import type { LinhaDashboardComRank, LinhaEquipeSemanal, ResumoPeriodo } from './dashboard'

const COR_TITULO_FUNDO = KPI_COLORS.BRAND_BLUE
const COR_TITULO_TEXTO = KPI_COLORS.HEADER_TEXT
const COR_HEADER_FUNDO = KPI_COLORS.BRAND_BLUE_LIGHT
const COR_HEADER_TEXTO = KPI_COLORS.HEADER_TEXT
const FONTE = KPI_FONTS.BODY.name

async function adicionarLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet): Promise<void> {
  try {
    const buffer = await getLogoBuffer()
    const imageId = wb.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: 'png' })
    ws.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 42, height: 30 } })
  } catch {
    // decorativo -- sem logo nunca bloqueia a geracao
  }
}

function estilizarTitulo(ws: ExcelJS.Worksheet, linha: number, qtdColunas: number, titulo: string, subtitulo?: string): void {
  ws.mergeCells(linha, 1, linha, qtdColunas)
  const cell = ws.getCell(linha, 1)
  cell.value = titulo
  cell.font = { name: FONTE, bold: true, size: 14, color: { argb: COR_TITULO_TEXTO } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO_FUNDO } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  ws.getRow(linha).height = 32
  if (subtitulo) {
    ws.mergeCells(linha + 1, 1, linha + 1, qtdColunas)
    const sub = ws.getCell(linha + 1, 1)
    sub.value = subtitulo
    sub.font = { name: FONTE, italic: true, size: 9, color: { argb: KPI_COLORS.TEXT_MUTED } }
    sub.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  }
}

function estilizarHeader(ws: ExcelJS.Worksheet, linha: number, qtdColunas: number): void {
  const row = ws.getRow(linha)
  for (let c = 1; c <= qtdColunas; c++) {
    const cell = row.getCell(c)
    cell.font = { name: FONTE, bold: true, color: { argb: COR_HEADER_TEXTO } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER_FUNDO } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }
  ws.views = [{ state: 'frozen', ySplit: linha }]
}

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

function formatarHora(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
}

function formatarMinutosParaHora(min: number | null): string {
  if (min == null || min < 0) return ''
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatarDuracao(min: number | null): string {
  if (min == null || min < 0) return ''
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}h${String(m).padStart(2, '0')}min`
}

function num(v: number | null, casas = 2): number | string {
  return v == null ? '' : Math.round(v * 10 ** casas) / 10 ** casas
}

const COLUNAS_DIA = ['DATA', 'PLACA', 'ROTA/DESTINO', 'QUANTIDADE DE NOTAS', 'SAÍDA DA BASE', 'CHEGADA NA BASE', 'KM', 'MOTORISTA', 'AJUDANTE 1', 'AJUDANTE 2', 'TEMPO EM ROTA', 'NOTAS/HORA', 'RANK DIÁRIO', 'PERFORMANCE'] as const

function nomeAbaDia(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia}.${mes}`
}

function escreverAbaDia(wb: ExcelJS.Workbook, data: string, linhas: LinhaDashboardComRank[]): void {
  const ws = wb.addWorksheet(nomeAbaDia(data))
  const [ano, mes, dia] = data.split('-')
  estilizarTitulo(ws, 1, COLUNAS_DIA.length, `CONTROLE DE FROTA - NUTRY MAX - ${dia}/${mes}/${ano}`)
  ws.addRow([...COLUNAS_DIA])
  estilizarHeader(ws, 2, COLUNAS_DIA.length)
  ws.columns = [
    { width: 12 }, { width: 12 }, { width: 20 }, { width: 18 }, { width: 14 }, { width: 14 },
    { width: 10 }, { width: 26 }, { width: 22 }, { width: 22 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 20 },
  ]
  linhas.forEach((l, i) => {
    ws.addRow([
      new Date(`${data}T00:00:00Z`), l.placa, l.rota, l.notas ?? '',
      formatarHora(l.saidaBase), formatarHora(l.chegadaBase), num(l.km, 2),
      l.motorista, l.ajudante1 ?? '', l.ajudante2 ?? '',
      formatarDuracao(l.tempoEmRotaMin), num(l.notasPorHora, 3), l.rankDia ?? '', l.performance,
    ])
    estilizarLinhaDado(ws, 3 + i, COLUNAS_DIA.length, i)
  })
  ws.getColumn(1).numFmt = 'dd/mm/yyyy'
}

const COLUNAS_PERFORMANCE_DIARIA = ['DATA', 'MOTORISTA', 'AJUDANTE 1', 'AJUDANTE 2', 'PLACA', 'ROTA', 'NOTAS', 'KM', 'HORAS EM ROTA', 'NOTAS/HORA', 'RANK DIA', 'PERFORMANCE'] as const

function escrevePerformanceDiaria(wb: ExcelJS.Workbook, linhas: LinhaDashboardComRank[]): void {
  const ws = wb.addWorksheet('PERFORMANCE DIÁRIA')
  const periodo = periodoTexto(linhas)
  estilizarTitulo(ws, 1, COLUNAS_PERFORMANCE_DIARIA.length, `PERFORMANCE DIÁRIA POR EQUIPE - NUTRY MAX | ${periodo}`,
    'Produtividade = notas ÷ horas em rota; sem horário válido = SEM DADO.')
  ws.addRow([...COLUNAS_PERFORMANCE_DIARIA])
  estilizarHeader(ws, 3, COLUNAS_PERFORMANCE_DIARIA.length)
  ws.columns = [
    { width: 12 }, { width: 26 }, { width: 22 }, { width: 22 }, { width: 12 }, { width: 20 },
    { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 20 },
  ]
  const ordenadas = [...linhas].sort((a, b) => (a.rankDia ?? Infinity) - (b.rankDia ?? Infinity))
  ordenadas.forEach((l, i) => {
    ws.addRow([
      new Date(`${l.data}T00:00:00Z`), l.motorista, l.ajudante1 ?? '', l.ajudante2 ?? '', l.placa, l.rota,
      l.notas ?? '', num(l.km, 2), num(l.tempoEmRotaMin != null ? l.tempoEmRotaMin / 60 : null, 3), num(l.notasPorHora, 3),
      l.rankDia ?? '', l.performance,
    ])
    estilizarLinhaDado(ws, 4 + i, COLUNAS_PERFORMANCE_DIARIA.length, i)
  })
  ws.getColumn(1).numFmt = 'dd/mm/yyyy'
}

const COLUNAS_PERFORMANCE = ['MOTORISTA', 'AJUDANTE 1', 'AJUDANTE 2', 'ROTAS', 'ROTAS C/ DADO', 'COBERTURA', 'TOTAL NOTAS', 'NOTAS VÁLIDAS KPI', 'TOTAL KM', 'HORAS VÁLIDAS', 'NOTAS/HORA', 'RANKING', 'PERFORMANCE'] as const

function escrevePerformanceSemanal(wb: ExcelJS.Workbook, equipes: LinhaEquipeSemanal[], periodo: string): void {
  const ws = wb.addWorksheet('PERFORMANCE')
  estilizarTitulo(ws, 1, COLUNAS_PERFORMANCE.length, `PERFORMANCE SEMANAL POR EQUIPE - NUTRY MAX | ${periodo}`,
    'TOTAL NOTAS = todas as notas registradas. NOTAS VÁLIDAS KPI = apenas rotas com horário válido. Equipes com cobertura incompleta não entram no ranking, evitando distorções.')
  ws.addRow([...COLUNAS_PERFORMANCE])
  estilizarHeader(ws, 3, COLUNAS_PERFORMANCE.length)
  ws.columns = [
    { width: 26 }, { width: 22 }, { width: 22 }, { width: 8 }, { width: 12 }, { width: 10 },
    { width: 12 }, { width: 16 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 20 },
  ]
  const ordenadas = [...equipes].sort((a, b) => (a.ranking ?? Infinity) - (b.ranking ?? Infinity))
  ordenadas.forEach((e, i) => {
    ws.addRow([
      e.motorista, e.ajudante1 ?? '', e.ajudante2 ?? '', e.rotas, e.rotasComDado, num(e.cobertura, 2),
      e.totalNotas, e.notasValidasKpi, num(e.totalKm, 2), num(e.horasValidas, 3), num(e.notasPorHora, 3),
      e.ranking ?? '', e.performance,
    ])
    estilizarLinhaDado(ws, 4 + i, COLUNAS_PERFORMANCE.length, i)
  })
}

function periodoTexto(linhas: { data: string }[]): string {
  const datas = [...new Set(linhas.map(l => l.data))].sort()
  if (datas.length === 0) return ''
  const fmt = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }
  return datas.length === 1 ? fmt(datas[0]) : `${fmt(datas[0])} A ${fmt(datas[datas.length - 1])}`
}

function escreveKpiSemanal(ws: ExcelJS.Worksheet, resumo: ResumoPeriodo, periodo: string): void {
  const cols = 12
  estilizarTitulo(ws, 1, cols, `KPI SEMANAL - NUTRY MAX | ${periodo}`,
    'Indicadores calculados com as informações do controle de frota; os nomes das equipes foram cruzados por placa nas escalas de cada dia.')
  const bloco = (linha: number, pares: [string, number | string][]) => {
    pares.forEach(([titulo], i) => {
      const col = i * 4 + 1
      ws.mergeCells(linha, col, linha, col + 1)
      const c = ws.getCell(linha, col)
      c.value = titulo
      c.font = { name: FONTE, bold: true, size: 10 }
    })
    pares.forEach(([, valor], i) => {
      const col = i * 4 + 1
      ws.mergeCells(linha + 1, col, linha + 1, col + 1)
      const c = ws.getCell(linha + 1, col)
      c.value = valor
      c.font = { name: FONTE, size: 12 }
      c.alignment = { horizontal: 'center' }
    })
  }
  bloco(3, [
    ['SAÍDAS EM ROTA', resumo.saidasEmRota],
    ['NOTAS ENTREGUES', resumo.notasEntregues],
    ['KM PERCORRIDOS', num(resumo.kmPercorridos, 2)],
    ['HORAS EM OPERAÇÃO', num(resumo.horasEmOperacao, 2)],
    ['MÉDIA NOTAS/HORA', num(resumo.mediaNotasPorHora, 3)],
    ['COBERTURA RASTREAMENTO', num(resumo.coberturaRastreamento, 4)],
  ])
  bloco(7, [
    ['SAÍDA MÉDIA DA BASE', formatarMinutosParaHora(resumo.saidaMediaDaBaseMin)],
    ['CHEGADA MÉDIA NA BASE', formatarMinutosParaHora(resumo.chegadaMediaNaBaseMin)],
    ['TEMPO MÉDIO EM ROTA', formatarDuracao(resumo.tempoMedioEmRotaMin)],
  ])
  ws.columns = Array(cols).fill({ width: 14 })
}

function escreveDashboard(ws: ExcelJS.Worksheet, resumo: ResumoPeriodo, melhorEquipe: LinhaEquipeSemanal | null, periodo: string): void {
  const cols = 14
  estilizarTitulo(ws, 1, cols, `DASHBOARD – KPI NUTRY MAX | ${periodo}`)
  const bloco = (linha: number, pares: [string, number | string][]) => {
    pares.forEach(([titulo], i) => {
      const col = i * 3 + 1
      ws.mergeCells(linha, col, linha, col + 2)
      const c = ws.getCell(linha, col)
      c.value = titulo
      c.font = { name: FONTE, bold: true, size: 10 }
    })
    pares.forEach(([, valor], i) => {
      const col = i * 3 + 1
      ws.mergeCells(linha + 1, col, linha + 1, col + 2)
      const c = ws.getCell(linha + 1, col)
      c.value = valor
      c.font = { name: FONTE, size: 14, bold: true }
      c.alignment = { horizontal: 'center' }
    })
  }
  bloco(4, [
    ['SAÍDAS EM ROTA', resumo.saidasEmRota],
    ['NOTAS ENTREGUES', resumo.notasEntregues],
    ['KM PERCORRIDOS', num(resumo.kmPercorridos, 2)],
    ['MÉDIA NOTAS/HORA', num(resumo.mediaNotasPorHora, 3)],
  ])
  bloco(8, [
    ['NOTAS / VEÍCULO', resumo.saidasEmRota > 0 ? num(resumo.notasEntregues / resumo.saidasEmRota, 2) : ''],
    ['COBERTURA RASTREAMENTO', num(resumo.coberturaRastreamento, 4)],
    ['TEMPO MÉDIO EM ROTA', formatarDuracao(resumo.tempoMedioEmRotaMin)],
    ['MELHOR EQUIPE – NOTAS/HORA', melhorEquipe ? `${melhorEquipe.motorista} (${num(melhorEquipe.notasPorHora, 2)})` : '-'],
  ])
  ws.columns = Array(cols).fill({ width: 13 })
}

export async function gerarDashboardNutrimaxXlsx(
  linhasPorDia: Map<string, LinhaDashboardComRank[]>,
  equipesSemanal: LinhaEquipeSemanal[],
  resumo: ResumoPeriodo,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()

  const datasOrdenadas = [...linhasPorDia.keys()].sort()
  for (const data of datasOrdenadas) {
    escreverAbaDia(wb, data, linhasPorDia.get(data) ?? [])
  }

  const todasLinhas = datasOrdenadas.flatMap(d => linhasPorDia.get(d) ?? [])
  const periodo = periodoTexto(todasLinhas)

  const wsSemanal = wb.addWorksheet('KPI SEMANAL')
  escreveKpiSemanal(wsSemanal, resumo, periodo)
  escrevePerformanceSemanal(wb, equipesSemanal, periodo)
  escrevePerformanceDiaria(wb, todasLinhas)
  const wsDashboard = wb.addWorksheet('DASHBOARD')
  const melhorEquipe = [...equipesSemanal].filter(e => e.ranking === 1)[0] ?? null
  escreveDashboard(wsDashboard, resumo, melhorEquipe, periodo)

  for (const ws of [wb.worksheets[0]]) await adicionarLogo(wb, ws)

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
