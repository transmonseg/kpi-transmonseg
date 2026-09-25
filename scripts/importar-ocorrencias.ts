// Importa a planilha "Ocorrencias KPI DD-MM.xlsx" que a equipe (Ana) preenche
// manualmente com a resolucao de cada NF ressalvada, e grava em
// kpi_nf_resolucao (Task 4, plano 2026-09-24-melhorias-relatorio-final-ana).
//
// Nao temos a planilha real de 23/09 ("Ocorrencias KPI 23-09.xlsx") nesta
// sessao -- o mapeamento de texto->enum usa os 6 textos que a equipe usa
// (confirmados no brief da task), tolerante a acento/caixa/espaco.
// Deteccao de coluna e' por CABECALHO (nome da coluna), nao por posicao fixa
// -- planilhas reais de equipe trocam de layout entre envios.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/importar-ocorrencias.ts \
//     <planilha.xlsx> <AAAA-MM-DD> --responsavel "Ana" [--aplicar] [--empresa "NUTRY MAX"]
//
// Sem --aplicar: so' imprime o que SERIA gravado (dry run, comportamento
// default -- nunca grava sem essa flag explicita).
import ExcelJS from 'exceljs'
import type { NovaResolucaoNf } from '../src/lib/kpi-romaneio/resolucoes'
import { registrarResolucao } from '../src/lib/kpi-romaneio/resolucoes'
import type { ResolucaoNf } from '../src/lib/kpi-romaneio/types'

/** Tira acento, baixa caixa, colapsa espaco (inclusive em volta de hifen) --
 *  a mesma planilha de equipe as vezes vem "Entregue no local- tempo..." e
 *  as vezes "Entregue no local -tempo...", nunca deve depender do espacamento
 *  exato de quem digitou. */
export function normalizarTextoOcorrencia(textoBruto: string): string {
  return textoBruto
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acento
    .toLowerCase()
    .replace(/\s*-\s*/g, ' - ') // hifen sempre com 1 espaco de cada lado
    .replace(/\s+/g, ' ')
    .trim()
}

// Textos EXATOS que a equipe usa hoje (brief da Task 4) -- chave normalizada.
const MAPA_RESOLUCAO: Record<string, ResolucaoNf> = {
  [normalizarTextoOcorrencia('Entregue no local')]: 'entregue',
  [normalizarTextoOcorrencia('Entregue no local - tempo de loja conferido')]: 'entregue_tempo_conferido',
  [normalizarTextoOcorrencia('Entregue no local - rastro oscilante')]: 'entregue_rastro_oscilante',
  [normalizarTextoOcorrencia('Entregue por outra placa')]: 'entregue_outra_placa',
  [normalizarTextoOcorrencia('Não esteve no local')]: 'nao_esteve_no_local',
  [normalizarTextoOcorrencia('Desatualizado')]: 'desatualizado',
}

/** `null` = texto que a equipe usou e nao reconhecemos -- NUNCA adivinha um
 *  mapeamento, fica pro chamador decidir (importador reporta em
 *  `naoMapeadas`, quem roda o script confere na mao). */
export function mapearResolucao(textoBruto: string): ResolucaoNf | null {
  const chave = normalizarTextoOcorrencia(textoBruto)
  return MAPA_RESOLUCAO[chave] ?? null
}

// Candidatos de cabecalho (ja normalizados) por coluna -- primeira coluna do
// cabecalho que CONTEM algum candidato vence. Varias planilhas de equipe
// nomeiam diferente ("Resolução", "Ocorrência", "Status Operação"), por isso
// e' `includes`, nao igualdade exata.
const CANDIDATOS_NF = ['nf', 'nota fiscal']
const CANDIDATOS_RESOLUCAO = ['resolu', 'ocorren', 'status opera']

function acharColuna(headers: string[], candidatos: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const h = normalizarTextoOcorrencia(headers[i])
    if (candidatos.some(c => h.includes(c))) return i
  }
  return null
}

export type ColunasDetectadas = { nf: number; resolucao: number }

/** Devolve os indices de coluna (0-based) de NF e resolucao pelo cabecalho,
 *  ou `null` se alguma das duas nao for encontrada -- o chamador decide
 *  (montarResolucoesDaPlanilha lanca erro; nunca segue com coluna adivinhada). */
export function detectarColunas(headers: string[]): ColunasDetectadas | null {
  const nf = acharColuna(headers, CANDIDATOS_NF)
  const resolucao = acharColuna(headers, CANDIDATOS_RESOLUCAO)
  if (nf === null || resolucao === null) return null
  return { nf, resolucao }
}

export type ContextoImportacao = { empresa: string; data: string; responsavel: string }

export type NaoMapeada = { linha: number; motivo: string }

/** `linhas` inclui o cabecalho na posicao 0 (igual uma leitura crua de
 *  planilha, linha por linha, celula por celula em string). Pura e testavel
 *  por fixture -- sem tocar em ExcelJS/rede, so' a logica de mapeamento. */
export function montarResolucoesDaPlanilha(
  linhas: string[][],
  ctx: ContextoImportacao,
): { resolucoes: NovaResolucaoNf[]; naoMapeadas: NaoMapeada[] } {
  const [cabecalho, ...dados] = linhas
  const colunas = cabecalho ? detectarColunas(cabecalho) : null
  if (!colunas) {
    throw new Error('Não encontrei as colunas de NF e resolução no cabeçalho da planilha (esperado algo como "NF"/"Nota Fiscal" e "Resolução"/"Ocorrência"/"Status Operação").')
  }

  const resolucoes: NovaResolucaoNf[] = []
  const naoMapeadas: NaoMapeada[] = []

  dados.forEach((linha, i) => {
    const numeroDaLinha = i + 2 // 1-based, +1 pelo cabecalho ja consumido
    const nf = (linha[colunas.nf] ?? '').trim()
    const textoResolucao = (linha[colunas.resolucao] ?? '').trim()
    if (!nf) {
      naoMapeadas.push({ linha: numeroDaLinha, motivo: 'NF vazia' })
      return
    }
    const resolucao = mapearResolucao(textoResolucao)
    if (!resolucao) {
      naoMapeadas.push({ linha: numeroDaLinha, motivo: `texto de resolução não reconhecido: "${textoResolucao}"` })
      return
    }
    resolucoes.push({
      empresa: ctx.empresa, data: ctx.data, nf, resolucao,
      placa_executora: null, observacao: null, responsavel: ctx.responsavel, documento: null,
    })
  })

  return { resolucoes, naoMapeadas }
}

function parseArgsCli(argv: string[]) {
  const [planilhaPath, data, ...resto] = argv
  let responsavel: string | null = null
  let empresa = 'NUTRY MAX'
  let aplicar = false
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] === '--responsavel') { responsavel = resto[++i]; continue }
    if (resto[i] === '--empresa') { empresa = resto[++i]; continue }
    if (resto[i] === '--aplicar') { aplicar = true; continue }
  }
  return { planilhaPath, data, responsavel, empresa, aplicar }
}

async function lerPlanilhaComoTexto(path: string): Promise<string[][]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  const linhas: string[][] = []
  ws.eachRow(row => {
    const valores = (row.values as unknown[]).slice(1).map(v => (v == null ? '' : String(v)))
    linhas.push(valores)
  })
  return linhas
}

async function main() {
  const { planilhaPath, data, responsavel, empresa, aplicar } = parseArgsCli(process.argv.slice(2))
  if (!planilhaPath || !data || !responsavel) {
    console.error('Uso: npx tsx --env-file=.env.local scripts/importar-ocorrencias.ts <planilha.xlsx> <AAAA-MM-DD> --responsavel "Nome" [--aplicar] [--empresa "NUTRY MAX"]')
    process.exit(1)
  }

  const linhas = await lerPlanilhaComoTexto(planilhaPath)
  const { resolucoes, naoMapeadas } = montarResolucoesDaPlanilha(linhas, { empresa, data, responsavel })

  console.log(`Planilha: ${planilhaPath} (${empresa}, ${data}, responsável: ${responsavel})`)
  console.log(`Resoluções reconhecidas: ${resolucoes.length}`)
  for (const r of resolucoes) console.log(`  NF ${r.nf} -> ${r.resolucao}`)
  if (naoMapeadas.length > 0) {
    console.log(`\nLinhas NÃO mapeadas (${naoMapeadas.length}) -- conferir na mão:`)
    for (const n of naoMapeadas) console.log(`  linha ${n.linha}: ${n.motivo}`)
  }

  if (!aplicar) {
    console.log('\n(dry run -- nada foi gravado; rode de novo com --aplicar pra persistir)')
    return
  }

  for (const r of resolucoes) {
    await registrarResolucao(r)
  }
  console.log(`\n${resolucoes.length} resolução(ões) gravada(s) em kpi_nf_resolucao.`)
}

if (process.env.VITEST !== 'true') {
  main().catch(e => { console.error(e); process.exit(1) })
}
