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
  const { rede_id, data, linhas } = input
  const redeNome = REDE_NOMES_CANONICOS[rede_id] ?? rede_id

  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load((await getKpiTemplateBuffer()) as any)
  const ws = wb.worksheets[0]
  ws.name = nomeAbaDoDia(data)

  preencherAba(ws, { rede_id, redeNome, data, linhas })

  if (rede_id === 'ZONA_SUL') {
    const { gerarAbaBaseZonaSul } = await import('./zona-sul-base')
    gerarAbaBaseZonaSul(wb)
  }

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
) {
  const { rede_id, redeNome, data, linhas: linhasRaw } = ctx

  // Renomeia lojas da escala para nome canônico do catálogo
  const linhas = linhasRaw.map(l => {
    const canon = resolverNomeCanonico(rede_id, l.loja_nome)
    return canon ? { ...l, loja_nome: canon } : l
  })
  const agrupadas = agruparPorLoja(linhas)
  const REDE = redeNome.toUpperCase()

  // Título e faixas de grupo — estilo já vem pronto do template
  ws.getCell('A1').value = `RELATÓRIO KPI - ${REDE}\n${formataDataPtBr(data)}`
  ws.getCell('B2').value = `${REDE} 1º CARRO`
  ws.getCell('H2').value = `${REDE} 2º CARRO`

  // Estilos-modelo (capturados ANTES de escrever): row 5 = 1ª linha, row 6 = demais
  const estiloPrimeira: Partial<ExcelJS.Style>[] = capturaEstilo(ws, 5)
  const estiloMeio: Partial<ExcelJS.Style>[] = capturaEstilo(ws, 6)

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

  // Remove linhas-modelo não usadas (o template traz rows 5 e 6 de fábrica)
  const usadas = lojasFinal.length
  if (usadas < 2) ws.spliceRows(5 + usadas, 2 - usadas)
}

function escreverLinha(ws: ExcelJS.Worksheet, row: number, ag: LinhaAgrupada, estilo: Partial<ExcelJS.Style>[]) {
  ws.getRow(row).height = 21.95

  const c1 = ag.carro1
  const c2 = ag.carro2

  // Veículo existe na escala mas sem nenhuma parada GPS registrada
  const semGps1 = c1 !== null && c1.saida_cd === null && c1.chd_loja_1 === null && c1.saida_loja_1 === null
  const semGps2 = c2 !== null && c2.saida_cd === null && c2.chd_loja_1 === null && c2.saida_loja_1 === null
  // Tem GPS (saiu do CD) mas não foi a esta loja específica
  const naoFoi1 = c1 !== null && !semGps1 && c1.chd_loja_1 === null
  const naoFoi2 = c2 !== null && !semGps2 && c2.chd_loja_1 === null
  // Veículo rastreado mas ficou na base / não fez entrega (sem_entrega) — não é erro de GPS
  const ficouNaBase1 = semGps1 && c1?.rota_status === 'sem_entrega'
  const ficouNaBase2 = semGps2 && c2?.rota_status === 'sem_entrega'

  const saida1 = toExcelTime(c1?.saida_cd)
  const chd1   = toExcelTime(c1?.chd_loja_1)
  const sai1   = toExcelTime(c1?.saida_loja_1)
  const saida2 = toExcelTime(c2?.saida_cd)
  const chd2   = toExcelTime(c2?.chd_loja_1)
  const sai2   = toExcelTime(c2?.saida_loja_1)

  const textoSlot1 = naoFoi1 ? 'NÃO FOI AO CLIENTE' : ficouNaBase1 ? null : semGps1 ? 'SEM RASTREADOR' : null
  const textoSlot2 = naoFoi2 ? 'NÃO FOI AO CLIENTE' : ficouNaBase2 ? null : semGps2 ? 'SEM RASTREADOR' : null

  // Strip "(2º CARRO)" prefix — redundante na coluna dedicada ao 2º carro
  const nome2 = c2?.motorista?.replace(/^\(2[oº°]\s*CARRO\)\s*/i, '') ?? ''

  const valores: (string | number)[] = [
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

  // Valor + estilo-modelo (fonte, fill, bordas, alinhamento e numFmt vêm do template)
  for (let c = 1; c <= N_COLS; c++) {
    const cell = ws.getCell(row, c)
    cell.value = valores[c - 1]
    cell.style = estilo[c - 1]
  }

  // Fórmulas TEMPO EM LOJA com result pré-calculado (ExcelJS não calcula sozinho).
  const tempo1 = computeTempoLoja(c1?.tempo_loja_1_min, chd1, sai1)
  const tempo2 = computeTempoLoja(c2?.tempo_loja_1_min, chd2, sai2)
  ws.getCell(row, 14).value = { formula: `MOD(G${row}-F${row},1)`, result: tempo1 }
  ws.getCell(row, 15).value = { formula: `MOD(M${row}-L${row},1)`, result: tempo2 }
}
