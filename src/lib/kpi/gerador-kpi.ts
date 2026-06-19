import ExcelJS from 'exceljs'
import type { KpiLinha } from '@/lib/types/kpi'
import { REDE_NOMES_CANONICOS, formataDataPtBr } from './kpi-styles'
import { getKpiTemplateBuffer, nomeAbaDoDia } from './template-loader'
import { getMatrizLojas, resolverNomeCanonico, MATRIZ_LOJAS } from '@/lib/lojas/catalogo-matriz'
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
  /** Adiciona a coluna "CHEGADA CD" (volta pra base) logo após a SAÍDA LOJA de cada
   * carro. Quando false (padrão), a planilha sai idêntica à aprovada. */
  comChegadaCd?: boolean
}

function toExcelTime(d: Date | null | undefined): number | null {
  if (!d) return null
  // Parsers armazenam BRT como Date.UTC(...) — usar getUTCHours direto sem reconverter
  return (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400
}

/**
 * Coluna "Tempo de Operação" — pedida pela Tia, ainda NÃO lançada.
 * Quando true, adiciona ao KPI as colunas "Chegada Base" (volta) e "Tempo de
 * Operação" (volta − saída da base). Manter FALSE até aprovação: com false a
 * planilha sai idêntica à de hoje.
 */
export const COL_TEMPO_OPERACAO = false

/** Tempo total da operação: da saída da base até a volta. Retorna min + HH:MM. */
export function calcTempoOperacao(saidaBase: Date | null, voltaBase: Date | null): { min: number; fmt: string } | null {
  if (!saidaBase || !voltaBase) return null
  let min = Math.round((voltaBase.getTime() - saidaBase.getTime()) / 60000)
  if (min < 0) min += 1440
  return { min, fmt: `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}` }
}

/**
 * Calcula tempo em loja como fração do dia (formato Excel).
 *
 * Prioridade:
 *   1. `tempoMin` vindo do Unitrac — já considera cruzamento de meia-noite e é
 *      computado em segundos absolutos, é o valor canônico
 *   2. Diff Excel `(saida - chegada + 1) % 1` — fallback quando o Unitrac não
 *      forneceu duracao_seg. O `+1) % 1` é necessário pra entregas noturnas
 *      (chegada 23:40, saída 01:15 → diff seria -22h25m, corrigido pra +1h35m)
 *   3. Zero quando faltam dados
 */
function computeTempoLoja(
  tempoMin: number | null | undefined,
  chd: number | null,
  sai: number | null,
): number {
  if (typeof tempoMin === 'number' && tempoMin > 0) return tempoMin / 1440  // min/24h
  if (chd !== null && sai !== null) return ((sai - chd) + 1) % 1
  return 0
}

function formatarPlacaDisplay(placa: string | null | undefined): string {
  if (!placa) return ''
  const norm = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  if (norm.length !== 7) return placa
  return `${norm.slice(0, 3)}-${norm.slice(3)}`
}

const N_COLS = 15

/**
 * Gera o KPI XLSX no layout REDESIGN. Em vez de recriar estilos no código, parte
 * de um TEMPLATE (`src/assets/kpi-template.xlsx`, exportado do arquivo aprovado):
 * rows 1-4 = cabeçalho pronto; rows 5/6 = modelos de linha de dados (primeira/demais).
 * Assim o resultado é byte-fiel ao modelo aprovado pela operação.
 */
export async function gerarKpi(input: GerarKpiInput): Promise<Buffer> {
  const { rede_id, data, linhas, comChegadaCd } = input
  const redeNome = REDE_NOMES_CANONICOS[rede_id] ?? rede_id

  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load((await getKpiTemplateBuffer()) as any)
  const ws = wb.worksheets[0]
  ws.name = nomeAbaDoDia(data)

  preencherAba(ws, { rede_id, redeNome, data, linhas }, comChegadaCd ?? false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from((await wb.xlsx.writeBuffer()) as any) as any
}

/** Captura o objeto de estilo de cada célula de uma linha-modelo do template. */
function capturaEstilo(ws: ExcelJS.Worksheet, row: number): Partial<ExcelJS.Style>[] {
  const arr: Partial<ExcelJS.Style>[] = []
  for (let c = 1; c <= N_COLS; c++) arr.push(ws.getCell(row, c).style)
  return arr
}

function preencherAba(
  ws: ExcelJS.Worksheet,
  ctx: { rede_id: string; redeNome: string; data: string; linhas: LinhaParaKpi[] },
  comChegadaCd: boolean,
) {
  const { rede_id, redeNome, data, linhas: linhasRaw } = ctx

  // Renomeia lojas da escala para nome canônico do catálogo
  const linhas = linhasRaw.map(l => {
    const canon = resolverNomeCanonico(rede_id, l.loja_nome)
    return canon ? { ...l, loja_nome: canon } : l
  })
  const agrupadas = agruparPorLoja(linhas)
  const REDE = redeNome.toUpperCase()

  // Estilos-modelo (capturados ANTES de mexer no layout): row 5 = 1ª linha, row 6 = demais
  const estiloPrimeira: Partial<ExcelJS.Style>[] = capturaEstilo(ws, 5)
  const estiloMeio: Partial<ExcelJS.Style>[] = capturaEstilo(ws, 6)

  // Título e faixas de grupo — estilo já vem pronto do template
  ws.getCell('A1').value = `RELATÓRIO KPI - ${REDE}\n${formataDataPtBr(data)}`
  ws.getCell('B2').value = `${REDE} 1º CARRO`
  ws.getCell('H2').value = `${REDE} 2º CARRO`

  // Ordem de lojas pelo catálogo; redes com catálogo fixo incluem todas as lojas
  const lojasNoDia = [...new Set(linhas.map(l => l.loja_nome).filter(Boolean))]
  const ordemLojas = getMatrizLojas(rede_id, lojasNoDia)
  const agrupadasMap = new Map(agrupadas.map(a => [a.loja_nome, a]))
  const temCatalogoFixo = Boolean(MATRIZ_LOJAS[rede_id])

  const lojasFinal: LinhaAgrupada[] = []
  for (const loja of ordemLojas) {
    const ag = agrupadasMap.get(loja)
    if (!ag) {
      if (temCatalogoFixo) lojasFinal.push({ loja_nome: loja, carro1: null, carro2: null, descartadas: [] })
      continue
    }
    lojasFinal.push(ag)
  }

  lojasFinal.forEach((ag, i) => escreverLinha(ws, 5 + i, ag, i === 0 ? estiloPrimeira : estiloMeio))

  const usadas = lojasFinal.length

  // Coluna CHEGADA CD: insere DEPOIS da Saída Loja de cada carro, preservando todo
  // o resto (spliceColumns nativo, sem mexer no layout aprovado).
  if (comChegadaCd) inserirColunaChegada(ws, lojasFinal)

  // A planilha termina na última loja: o template traz o grid pré-formatado (bordas)
  // até a linha 30. spliceRows não reduz a dimensão do template, então zera
  // estilo + valor das células abaixo do último dado (some o grid vazio).
  const ultimaLinha = 4 + Math.max(usadas, 1)
  const totalRows = ws.rowCount
  const totalCols = ws.columnCount
  for (let r = ultimaLinha + 1; r <= totalRows; r++) {
    for (let c = 1; c <= totalCols; c++) {
      const cell = ws.getCell(r, c)
      cell.value = null
      cell.style = {}
    }
  }
}

/**
 * Legenda da observação no XLSX quando o carro NÃO entregou nesta loja.
 * Regra (cliente, atualizada 2026-06-04):
 *  - placa NÃO aparece no relatório (sem rastreador de verdade) → "SEM RASTREADOR"
 *  - placa rastreada e foi a alguma LOJA (entregou em outro lugar) → "MUDOU DE ROTA"
 *  - placa rastreada mas só ficou na BASE (não saiu do CD) → "NÃO SAIU DA BASE"
 *  - placa rastreada, saiu da base mas sem entrega confirmada → "NÃO FOI AO CLIENTE"
 * IMPORTANTE: se a placa está no relatório, ela TEM rastreador — só vira "sem
 * rastreador" quando nem aparece. Carro com entrega (chd_loja_1 != null) → null.
 * Sem os flags por-placa (ex: linha recarregada do banco), cai num fallback seguro.
 */
export function legendaSlot(c: LinhaParaKpi | null): string | null {
  if (!c) return null
  if (c.chd_loja_1 !== null) return null
  // Sugestão de troca ALTA: outro carro da rede (com rota própria) esteve nesta loja.
  // Mostra "mudou de rota, conferir" mesmo se a placa escalada não estiver rastreada
  // (foi a substituta que rodou). Precede os ramos de "não foi"/"sem rastreador".
  if (c.sugestao_troca_alta) return 'MUDOU DE ROTA - CONFERIR'
  // Tem rastreador na frota da API mas sem transmitir hoje → DESATUALIZADO (precisa
  // manutenção). Precede tudo: não é "sem rastreador" (informação falsa pro cliente).
  if (c.placa_desatualizada) return 'DESATUALIZADO'
  // Relatório cedo: não dá pra concluir "não foi" — mostra o ANDAMENTO honesto.
  if (c.relatorio_cedo) {
    if (c.placa_rastreada === false) return 'SEM RASTREADOR'
    if (c.placa_saiu_da_base === false) return 'AGUARDANDO BASE'
    return 'EM ROTA'
  }
  if (c.placa_rastreada === undefined) {
    const semGps = c.saida_cd === null && c.saida_loja_1 === null
    if (c.rota_status === 'sem_entrega') return 'NÃO FOI AO CLIENTE'
    return semGps ? 'SEM RASTREADOR' : 'NÃO FOI AO CLIENTE'
  }
  // Fora do relatório, mas a API confirma rastreador funcionando hoje → tem equipamento,
  // só não apareceu. "NÃO FOI AO CLIENTE", nunca "SEM RASTREADOR" (acusação falsa).
  if (!c.placa_rastreada && c.placa_tem_rastreador_api) return 'NÃO FOI AO CLIENTE'
  if (!c.placa_rastreada) return 'SEM RASTREADOR'
  if (c.placa_foi_algum_lugar) return 'MUDOU DE ROTA - CONFERIR'
  if (c.placa_saiu_da_base === false) return 'NÃO SAIU DA BASE'
  return 'NÃO FOI AO CLIENTE'
}

/**
 * Valores das 3 células de tempo de um carro (SAÍDA CD, CHEGADA LOJA, SAÍDA LOJA).
 *  - Relatório parcial (saiu da base, sem chegada no corte): mostra a SAÍDA DE BASE
 *    na coluna SAÍDA CD e "RELATÓRIO PARCIAL" nas demais — não esconde a saída real.
 *  - Sem entrega: repete a legenda nas 3 células (comportamento atual).
 *  - Entregue: os próprios horários.
 */
export function celulasSlot(
  c: LinhaParaKpi | null,
  saidaEx: number | null, chdEx: number | null, saiEx: number | null,
): (string | number)[] {
  if (c?.relatorio_parcial && c.chd_loja_1 === null) {
    const sb = toExcelTime(c.saida_base_parcial)
    // Em rota: mostra a SAÍDA CD (fato) e "EM ROTA" nas outras colunas (regra do
    // operador / caso FHO). Em relatório não-cedo, mantém "RELATÓRIO PARCIAL".
    const txt = c.relatorio_cedo ? (legendaSlot(c) ?? 'EM ROTA') : 'RELATÓRIO PARCIAL'
    return [sb ?? (saidaEx ?? ''), txt, txt]
  }
  const slot = legendaSlot(c)
  return [slot ?? (saidaEx ?? ''), slot ?? (chdEx ?? ''), slot ?? (saiEx ?? '')]
}

function escreverLinha(ws: ExcelJS.Worksheet, row: number, ag: LinhaAgrupada, estilo: Partial<ExcelJS.Style>[]) {
  ws.getRow(row).height = 21.95

  const c1 = ag.carro1
  const c2 = ag.carro2

  const saida1 = toExcelTime(c1?.saida_cd)
  const chd1   = toExcelTime(c1?.chd_loja_1)
  const sai1   = toExcelTime(c1?.saida_loja_1)
  const saida2 = toExcelTime(c2?.saida_cd)
  const chd2   = toExcelTime(c2?.chd_loja_1)
  const sai2   = toExcelTime(c2?.saida_loja_1)

  const [s1cd, s1chd, s1sai] = celulasSlot(c1, saida1, chd1, sai1)
  const [s2cd, s2chd, s2sai] = celulasSlot(c2, saida2, chd2, sai2)

  // Strip "(2º CARRO)" prefix — redundante na coluna dedicada ao 2º carro
  const nome2 = c2?.motorista?.replace(/^\(2[oº°]\s*CARRO\)\s*/i, '') ?? ''

  const valores: (string | number)[] = [
    ag.loja_nome,
    c1?.motorista ?? '', c1?.motorista_codigo ?? '', formatarPlacaDisplay(c1?.placa),
    s1cd, s1chd, s1sai,
    nome2, c2?.motorista_codigo ?? '', formatarPlacaDisplay(c2?.placa),
    s2cd, s2chd, s2sai,
    '', '',
  ]

  // Valor + estilo-modelo (fonte, fill, bordas, alinhamento e numFmt vêm do template)
  for (let c = 1; c <= N_COLS; c++) {
    const cell = ws.getCell(row, c)
    cell.value = valores[c - 1]
    cell.style = estilo[c - 1]
  }

  // Garante numFmt de hora nas colunas de tempo de AMBOS os carros.
  // O template tem o formato correto nas colunas do 1º carro (col 5-7), mas
  // frequentemente não nas do 2º carro (col 11-13) — sem isso o Excel exibe
  // a fração decimal (ex: 0.188194) em vez de "04:31".
  const fmtHora = (estilo[4]?.numFmt as string | undefined) || 'hh:mm'
  const COLS_HORA = [5, 6, 7, 11, 12, 13]
  for (const c of COLS_HORA) {
    const cell = ws.getCell(row, c)
    if (typeof cell.value === 'number') cell.numFmt = fmtHora
  }

  // Fórmulas TEMPO EM LOJA com result pré-calculado (ExcelJS não calcula sozinho).
  // Só emite a fórmula quando CHD e SAÍDA são horários numéricos. Se a célula tem
  // texto ("SEM RASTREADOR" / "NÃO FOI AO CLIENTE"), MOD(texto) recalcula como #VALUE!
  // no Excel — então deixa em branco (como no modelo aprovado).
  // Só emite a fórmula quando as células de CHD/SAÍDA são horários numéricos
  // (não um rótulo de texto como "NÃO FOI AO CLIENTE" / "RELATÓRIO PARCIAL").
  const temTempo1 = typeof s1chd === 'number' && typeof s1sai === 'number' && chd1 !== null && sai1 !== null
  const temTempo2 = typeof s2chd === 'number' && typeof s2sai === 'number' && chd2 !== null && sai2 !== null
  if (temTempo1) {
    ws.getCell(row, 14).value = { formula: `MOD(G${row}-F${row},1)`, result: computeTempoLoja(c1?.tempo_loja_1_min, chd1, sai1) }
  }
  if (temTempo2) {
    ws.getCell(row, 15).value = { formula: `MOD(M${row}-L${row},1)`, result: computeTempoLoja(c2?.tempo_loja_1_min, chd2, sai2) }
  }
}

// Clone profundo de estilo (evita corromper objetos de estilo compartilhados pelo
// ExcelJS quando reatribuímos bordas).
function cloneEstilo(s: Partial<ExcelJS.Style>): Partial<ExcelJS.Style> {
  return JSON.parse(JSON.stringify(s ?? {}))
}

/**
 * Versão "com Chegada CD": adiciona 3 colunas ao FIM de cada carro —
 * CHEGADA CD (volta pra base), TEMPO EM LOJA (tirado do canto e trazido pra dentro do
 * carro) e TEMPO OPERAÇÃO (Chegada CD − Saída CD, o ciclo base→base). Parte da planilha
 * "sem" pronta e usa `spliceColumns` nativo (preserva estilos), depois ajusta bordas,
 * cabeçalhos, valores e merges. 15 colunas → 19.
 */
function inserirColunaChegada(ws: ExcelJS.Worksheet, lojasFinal: LinhaAgrupada[]) {
  const fina: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFCFD8DC' } }
  const grossa = (argb: string): Partial<ExcelJS.Border> => ({ style: 'medium', color: { argb } })

  for (const m of ['A1:O1', 'B2:G2', 'H2:M2']) {
    try { ws.unMergeCells(m) } catch { /* pode não existir */ }
  }

  // Remove as 2 colunas "TEMPO EM LOJA" do canto (vão voltar dentro de cada carro).
  ws.spliceColumns(14, 2)
  // Insere 3 colunas depois da Saída Loja do carro 1 (col 7) e do carro 2 (agora col 16).
  ws.spliceColumns(8, 0, [], [], [])
  ws.spliceColumns(17, 0, [], [], [])

  // Cada carro: [saídaLoja, chegada, tempoLoja, tempoOp] + cor da borda de fim-de-carro.
  const carros = [
    { saida: 7, cols: [8, 9, 10] as const, dado: (ag: LinhaAgrupada) => ag.carro1, endArgb: 'FF153C6B' },
    { saida: 16, cols: [17, 18, 19] as const, dado: (ag: LinhaAgrupada) => ag.carro2, endArgb: 'FF1E3C72' },
  ]
  for (const c of carros) for (const col of c.cols) ws.getColumn(col).width = ws.getColumn(5).width

  // Estilos + bordas em TODAS as linhas do cabeçalho/dados — incluindo a row 4, que é
  // uma faixa fina escura embaixo do cabeçalho (a "linha"). Pular a row 4 deixava a
  // coluna nova branca embaixo do nome.
  const lastDataRow = 4 + lojasFinal.length
  for (let r = 1; r <= lastDataRow; r++) {
    for (const c of carros) {
      // Saída Loja deixa de ser fim-de-carro → borda fina.
      const eSaida = cloneEstilo(ws.getCell(r, c.saida).style)
      eSaida.border = { ...(eSaida.border ?? {}), right: fina }
      ws.getCell(r, c.saida).style = eSaida
      // As 3 novas herdam o estilo da Saída CD (hora + grid); a última (Tempo Op) leva
      // a borda grossa de fim-de-carro.
      c.cols.forEach((col, idx) => {
        const e = cloneEstilo(ws.getCell(r, 5).style)
        e.border = { ...(e.border ?? {}), right: idx === 2 ? grossa(c.endArgb) : fina }
        ws.getCell(r, col).style = e
      })
    }
  }

  // Cabeçalhos das novas colunas.
  for (const c of carros) {
    ws.getCell(3, c.cols[0]).value = 'CHEGADA CD'
    ws.getCell(3, c.cols[1]).value = 'TEMPO EM LOJA'
    ws.getCell(3, c.cols[2]).value = 'TEMPO OPERAÇÃO'
  }

  // Valores por linha de dado.
  lojasFinal.forEach((ag, i) => {
    const row = 5 + i
    for (const c of carros) {
      const d = c.dado(ag)
      const slot = legendaSlot(d)
      const chd = toExcelTime(d?.chd_loja_1)
      const sai = toExcelTime(d?.saida_loja_1)
      const chegada = slot ? '' : (toExcelTime(d?.chegada_base) ?? '')
      const tLoja = (!slot && chd !== null && sai !== null) ? computeTempoLoja(d?.tempo_loja_1_min, chd, sai) : ''
      const op = (!slot && d?.saida_cd && d?.chegada_base) ? calcTempoOperacao(d.saida_cd, d.chegada_base) : null
      ws.getCell(row, c.cols[0]).value = chegada
      ws.getCell(row, c.cols[1]).value = tLoja
      ws.getCell(row, c.cols[2]).value = op ? op.min / 1440 : ''
    }
  })

  ws.mergeCells('A1:S1')
  ws.mergeCells('B2:J2')
  ws.mergeCells('K2:S2')
}
