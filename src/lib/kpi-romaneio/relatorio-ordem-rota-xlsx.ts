// 12/11 + 14/11 (dono: "o arquivo tá feio, sem dados, não dá pra filtrar"):
// planilha da Ordem da rota no padrão visual dos relatórios do KPI (paleta,
// fonte e logo da Benassi/Nutry). Cada aba é uma TABELA do Excel (filtro e
// ordenação em todas as colunas, linhas zebradas), cabeçalho congelado, data
// e hora como valores de verdade (o filtro do Excel entende "entre 08:00 e
// 12:00"), % com barra, fora da ordem em laranja.
import ExcelJS from 'exceljs'
import { KPI_COLORS } from '@/lib/kpi/kpi-styles'
import { getLogoBuffer } from '@/lib/kpi/template-loader'
import type { RelatorioOrdemRota } from './relatorio-ordem-rota'

const LARANJA_BG = 'FFFDEBD3', LARANJA_TX = 'FF9A3412', VERDE_TX = 'FF166534', CINZA = 'FF64748B'
const FONTE = 'Calibri'

const dataExcel = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))))
/** "08:30" -> fração do dia (hora de verdade no Excel). */
const horaExcel = (h: string | null | undefined) => (h && /^\d{2}:\d{2}/.test(h) ? (Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))) / 1440 : null)
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

type Coluna = { titulo: string; largura: number; formato?: string; alinhar?: 'left' | 'center' | 'right' }

async function cabecalho(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, titulo: string, sub: string, ncols: number): Promise<number> {
  ws.mergeCells(1, 1, 1, ncols)
  ws.mergeCells(2, 1, 2, ncols)
  const t = ws.getCell(1, 1)
  t.value = titulo
  t.font = { name: FONTE, size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BRAND_BLUE } }
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 4 }
  ws.getRow(1).height = 34
  // Impressão/PDF: paisagem, cabe na largura da folha, cabeçalho em toda página.
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } }
  ws.headerFooter = { oddFooter: '&L&8Transmonseg · Ordem da rota&R&8Página &P de &N' }
  const s = ws.getCell(2, 1)
  s.value = sub
  s.font = { name: FONTE, size: 10, italic: true, color: { argb: KPI_COLORS.TEXT_MUTED } }
  s.alignment = { vertical: 'middle', wrapText: true, indent: 1 }
  ws.getRow(2).height = 30
  try {
    const id = wb.addImage({ buffer: (await getLogoBuffer()) as unknown as ExcelJS.Buffer, extension: 'png' })
    ws.addImage(id, { tl: { col: 0.1, row: 0.12 }, ext: { width: 36, height: 26 } })
  } catch { /* logo é decorativo */ }
  return 4 // primeira linha da tabela
}

function tabela(ws: ExcelJS.Worksheet, nome: string, linha: number, colunas: Coluna[], linhas: unknown[][]) {
  colunas.forEach((c, i) => { ws.getColumn(i + 1).width = c.largura })
  ws.addTable({
    name: nome, ref: `A${linha}`, headerRow: true, totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: colunas.map(c => ({ name: c.titulo, filterButton: true })),
    rows: linhas.length ? linhas : [colunas.map(() => null)],
  })
  const head = ws.getRow(linha)
  head.height = 30
  head.eachCell(c => {
    c.font = { name: FONTE, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BRAND_BLUE } }
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  for (let r = linha + 1; r <= linha + Math.max(1, linhas.length); r++) {
    const row = ws.getRow(r)
    colunas.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      cell.font = { name: FONTE, size: 10, color: { argb: KPI_COLORS.TEXT_DEFAULT } }
      if (c.formato) cell.numFmt = c.formato
      cell.alignment = { vertical: 'middle', horizontal: c.alinhar ?? (c.formato ? 'center' : 'left') }
    })
  }
  ws.views = [{ state: 'frozen', ySplit: linha, xSplit: 0 }]
  ws.pageSetup.printTitlesRow = `${linha}:${linha}`
}

function barraPct(ws: ExcelJS.Worksheet, col: string, de: number, ate: number) {
  if (ate < de) return
  ws.addConditionalFormatting({
    ref: `${col}${de}:${col}${ate}`,
    rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF5B9BD5' } } as unknown as ExcelJS.ConditionalFormattingRule],
  })
  ws.addConditionalFormatting({
    ref: `${col}${de}:${col}${ate}`,
    rules: [{ type: 'cellIs', operator: 'lessThan', formulae: ['0.7'], priority: 2, style: { font: { bold: true, color: { argb: LARANJA_TX } } } }],
  })
}

/** Linha inteira em laranja quando a coluna de situação diz FORA DA ORDEM.
 *  Formatação condicional (não pintura fixa): continua certa depois que a
 *  pessoa ordena ou filtra, e o tema da tabela não cobre. */
function destacarForaDaOrdem(ws: ExcelJS.Worksheet, de: number, ate: number, ultimaCol: string, colSituacao: string) {
  if (ate < de) return
  ws.addConditionalFormatting({
    ref: `A${de}:${ultimaCol}${ate}`,
    rules: [{ type: 'expression', priority: 1, formulae: ['$' + colSituacao + String(de) + '="FORA DA ORDEM"'],
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: LARANJA_BG } }, font: { color: { argb: LARANJA_TX } } } }],
  })
}

export async function gerarXlsxOrdemRota(r: RelatorioOrdemRota, filtro = 'Sem filtro (todas as viagens)'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Transmonseg KPI'
  wb.created = new Date()
  const periodo = r.de === r.ate ? br(r.de) : `${br(r.de)} a ${br(r.ate)}`
  const sub = `Rio Quality · ${periodo} · ${filtro}`
  const pct = (x: number) => x / 100

  // ---------- Resumo ----------
  const res = wb.addWorksheet('Resumo', { properties: { tabColor: { argb: KPI_COLORS.BRAND_BLUE } } })
  await cabecalho(wb, res, 'ORDEM DA ROTA — o motorista seguiu a roteirização?', sub, 6)
  const cartoes: [string, string | number, string][] = [
    ['Na ordem planejada', pct(r.total.pct), '0.0%'],
    ['Entregas analisadas', r.total.entregas, '#,##0'],
    ['Fora da ordem', r.total.entregas - r.total.naOrdem, '#,##0'],
    ['Viagens', r.total.viagens, '#,##0'],
    ['De trás pra frente', r.total.invertidas, '#,##0'],
    ['Motoristas', r.motoristas.length, '#,##0'],
    ['Viagens que andaram mais que o plano', r.total.maisLongas, '#,##0'],
  ]
  ;[1, 2, 3, 4, 5, 6, 7].forEach(c => { res.getColumn(c).width = 19 })
  cartoes.forEach(([rot, val, fmt], i) => {
    const col = 1 + i
    const a = res.getCell(4, col), b = res.getCell(5, col)
    a.value = rot
    a.font = { name: FONTE, size: 9, bold: true, color: { argb: CINZA } }
    a.alignment = { horizontal: 'center', vertical: 'bottom', wrapText: true }
    b.value = val as number
    b.numFmt = fmt
    b.font = { name: FONTE, size: 20, bold: true, color: { argb: i === 0 ? (r.total.pct < 70 ? LARANJA_TX : VERDE_TX) : (i === 2 || i === 4 || i === 6) && Number(val) > 0 ? LARANJA_TX : KPI_COLORS.TEXT_DEFAULT } }
    b.alignment = { horizontal: 'center', vertical: 'middle' }
    for (const c of [a, b]) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  })
  res.getRow(4).height = 26
  res.getRow(5).height = 36
  res.mergeCells(7, 1, 9, 7)
  const como = res.getCell(7, 1)
  como.value = 'Como ler: em cada viagem, as entregas são ordenadas pela hora em que o caminhão chegou no cliente (GPS). "Na ordem" é a maior sequência que respeita a ordem planejada no relatório de ordem; as outras entregas foram feitas fora da ordem — o motorista pulou o cliente e voltou depois, ou inverteu a rota. "Km a mais" compara, em linha reta entre as paradas do GPS, o caminho feito com o caminho na ordem do plano: positivo = andou mais; negativo = fez um caminho mais curto que a roteirização (fora da ordem nem sempre é ruim). "Km na melhor ordem" é a ordem mais curta entre as mesmas paradas, para comparar com a roteirização. Use as abas abaixo e os filtros (setinhas) do cabeçalho de cada tabela para escolher motorista, placa, dia ou horário.'
  como.font = { name: FONTE, size: 10, color: { argb: KPI_COLORS.TEXT_MUTED } }
  como.alignment = { wrapText: true, vertical: 'top' }
  const ini = 11
  tabela(res, 'PorDia', ini, [
    { titulo: 'Dia', largura: 19, formato: 'dd/mm/yyyy' }, { titulo: 'Entregas', largura: 19, formato: '#,##0' },
    { titulo: 'Na ordem', largura: 19, formato: '#,##0' }, { titulo: 'Fora da ordem', largura: 19, formato: '#,##0' },
    { titulo: '% na ordem', largura: 19, formato: '0.0%' }, { titulo: 'Viagens', largura: 19, formato: '#,##0' },
  ], r.dias.map(d => [dataExcel(d.data), d.entregas, d.naOrdem, d.entregas - d.naOrdem, pct(d.pct), d.viagens]))
  barraPct(res, 'E', ini + 1, ini + r.dias.length)
  res.views = [{ state: 'normal' }]

  // ---------- Motoristas / Placas ----------
  const ranking = async (nome: string, tituloChave: string, tituloSub: string, lista: RelatorioOrdemRota['motoristas'], tabelaNome: string) => {
    const ws = wb.addWorksheet(nome)
    const linha = await cabecalho(wb, ws, `${nome.toUpperCase()} — pior primeiro`, sub, 12)
    tabela(ws, tabelaNome, linha, [
      { titulo: tituloChave, largura: 34 }, { titulo: tituloSub, largura: 30 },
      { titulo: '% na ordem', largura: 13, formato: '0.0%' }, { titulo: 'Entregas', largura: 11, formato: '#,##0' },
      { titulo: 'Na ordem', largura: 11, formato: '#,##0' }, { titulo: 'Fora da ordem', largura: 13, formato: '#,##0' },
      { titulo: 'Viagens', largura: 10, formato: '#,##0' }, { titulo: 'De trás pra frente', largura: 14, formato: '#,##0' },
      { titulo: 'Planejadas não entregues', largura: 16, formato: '#,##0' },
      { titulo: 'Dias abaixo de 70%', largura: 13, formato: '#,##0' }, { titulo: 'Dias', largura: 8, formato: '#,##0' },
      { titulo: 'Km a mais', largura: 11, formato: '#,##0.0' },
    ], lista.map(a => [a.nome, a.sub, pct(a.pct), a.entregas, a.naOrdem, a.entregas - a.naOrdem, a.viagens, a.invertidas, a.naoFeitas, a.diasAbaixo, a.porDia.length, a.kmExtra]))
    barraPct(ws, 'C', linha + 1, linha + lista.length)
  }
  await ranking('Motoristas', 'Motorista', 'Placas', r.motoristas, 'Motoristas')
  await ranking('Placas', 'Placa', 'Motoristas', r.placas, 'Placas')

  // ---------- Viagens ----------
  const wv = wb.addWorksheet('Viagens')
  const lv = await cabecalho(wb, wv, 'VIAGENS — uma linha por romaneio', sub, 20)
  tabela(wv, 'Viagens', lv, [
    { titulo: 'Dia', largura: 11, formato: 'dd/mm/yyyy' }, { titulo: 'Placa', largura: 10 }, { titulo: 'Motorista', largura: 30 },
    { titulo: 'Destino', largura: 28 }, { titulo: 'Romaneio', largura: 11 },
    { titulo: 'Saiu da base', largura: 10, formato: 'hh:mm' }, { titulo: '1ª entrega', largura: 10, formato: 'hh:mm' },
    { titulo: 'Última entrega', largura: 10, formato: 'hh:mm' }, { titulo: 'Voltou à base', largura: 10, formato: 'hh:mm' },
    { titulo: 'Km', largura: 8, formato: '#,##0.0' },
    { titulo: '% na ordem', largura: 12, formato: '0.0%' }, { titulo: 'Entregas', largura: 10, formato: '#,##0' },
    { titulo: 'Na ordem', largura: 10, formato: '#,##0' }, { titulo: 'Fora da ordem', largura: 11, formato: '#,##0' },
    { titulo: 'De trás pra frente', largura: 11 }, { titulo: 'Planejadas não entregues', largura: 13, formato: '#,##0' },
    { titulo: 'Km feito (linha reta)', largura: 11, formato: '#,##0.0' }, { titulo: 'Km no plano (linha reta)', largura: 11, formato: '#,##0.0' },
    { titulo: 'Km a mais', largura: 10, formato: '#,##0.0' },
    { titulo: 'Km na melhor ordem (sugestão)', largura: 13, formato: '#,##0.0' },
  ], r.viagens.map(v => [
    dataExcel(v.data), v.placa, v.motorista, v.destino, v.romaneio,
    horaExcel(v.saidaBase), horaExcel(v.primeira), horaExcel(v.ultima), horaExcel(v.chegadaBase), v.km,
    pct(v.pct), v.entregas, v.naOrdem, v.entregas - v.naOrdem, v.invertida ? 'SIM' : '', v.naoFeitas,
    v.kmFeito, v.kmPlano, v.kmExtra, v.kmMelhor,
  ]))
  barraPct(wv, 'K', lv + 1, lv + r.viagens.length)

  // ---------- Entregas (sequência) ----------
  const we = wb.addWorksheet('Entregas', { properties: { tabColor: { argb: 'FFF59E0B' } } })
  const le = await cabecalho(wb, we, 'ENTREGAS — na ordem em que aconteceram (laranja = fora da ordem)', sub, 14)
  const entregas = r.viagens.flatMap(v => v.sequencia.map(s => ({ v, s })))
  tabela(we, 'Entregas', le, [
    { titulo: 'Dia', largura: 11, formato: 'dd/mm/yyyy' }, { titulo: 'Placa', largura: 10 }, { titulo: 'Motorista', largura: 28 },
    { titulo: 'Romaneio', largura: 11 }, { titulo: 'Feita como', largura: 9, formato: '0"ª"' }, { titulo: 'Era a', largura: 8, formato: '0"ª"' },
    { titulo: 'Situação', largura: 15 }, { titulo: 'Chegou', largura: 9, formato: 'hh:mm' }, { titulo: 'Saiu', largura: 9, formato: 'hh:mm' },
    { titulo: 'Min. no cliente', largura: 10, formato: '#,##0' }, { titulo: 'Cliente', largura: 38 }, { titulo: 'Endereço', largura: 48 },
    { titulo: 'NF', largura: 11 }, { titulo: 'Carga', largura: 11 },
  ], entregas.map(({ v, s }) => [
    dataExcel(v.data), v.placa, v.motorista, v.romaneio, s.real, s.planejada, s.naOrdem ? 'Na ordem' : 'FORA DA ORDEM',
    horaExcel(s.chegada), horaExcel(s.saida), s.tempoMin, s.cliente, s.endereco, s.nf, s.carga,
  ]))
  destacarForaDaOrdem(we, le + 1, le + entregas.length, 'N', 'G')
  for (let i = 0; i < entregas.length; i++) {
    const c = we.getRow(le + 1 + i).getCell(7)
    c.font = { name: FONTE, size: 10, bold: !entregas[i].s.naOrdem, color: { argb: entregas[i].s.naOrdem ? VERDE_TX : LARANJA_TX } }
  }

  // ---------- Clientes fora da ordem ----------
  const wc = wb.addWorksheet('Clientes fora da ordem')
  const lc = await cabecalho(wb, wc, 'CLIENTES MAIS ENTREGUES FORA DA ORDEM — vários motoristas pulando o mesmo cliente = olhar a roteirização', sub, 6)
  tabela(wc, 'Clientes', lc, [
    { titulo: 'Cliente', largura: 40 }, { titulo: 'Endereço', largura: 52 },
    { titulo: 'Entregas', largura: 10, formato: '#,##0' }, { titulo: 'Fora da ordem', largura: 12, formato: '#,##0' },
    { titulo: '% fora da ordem', largura: 13, formato: '0.0%' }, { titulo: 'Motoristas que pularam', largura: 13, formato: '#,##0' },
  ], r.clientes.map(c => [c.cliente, c.endereco, c.vezes, c.fora, pct(c.pctFora), c.motoristas]))

  // ---------- Não entregues ----------
  const wn = wb.addWorksheet('Não entregues')
  const ln = await cabecalho(wb, wn, 'PLANEJADAS E NÃO ENTREGUES — ficam fora da conta da ordem', sub, 9)
  const naoFeitas = r.viagens.flatMap(v => v.naoFeitasLista.map(n => ({ v, n })))
  tabela(wn, 'NaoEntregues', ln, [
    { titulo: 'Dia', largura: 11, formato: 'dd/mm/yyyy' }, { titulo: 'Placa', largura: 10 }, { titulo: 'Motorista', largura: 28 },
    { titulo: 'Romaneio', largura: 11 }, { titulo: 'Era a', largura: 8, formato: '0"ª"' }, { titulo: 'Situação no KPI', largura: 18 },
    { titulo: 'Cliente', largura: 38 }, { titulo: 'Endereço', largura: 48 }, { titulo: 'NF', largura: 11 },
  ], naoFeitas.map(({ v, n }) => [dataExcel(v.data), v.placa, v.motorista, v.romaneio, n.planejada, SITUACAO[n.situacao] ?? n.situacao, n.cliente, n.endereco, n.nf]))

  return Buffer.from(await wb.xlsx.writeBuffer())
}

const SITUACAO: Record<string, string> = {
  pendente: 'Pendente', nao_foi: 'Não foi ao cliente', nao_confirmada: 'Não confirmada', revisar: 'A revisar',
  sem_rastreador: 'Sem rastreador', fora_da_conta: 'Fora da conta', entregue: 'Entregue (sem hora)',
}
