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
import type { NovaResolucaoNf, ResolucaoNfRow } from '../src/lib/kpi-romaneio/resolucoes'
import { buscarResolucoes, registrarResolucao, vigentesPorNf } from '../src/lib/kpi-romaneio/resolucoes'
import type { ResolucaoNf } from '../src/lib/kpi-romaneio/types'

/** Tira acento, baixa caixa, colapsa espaco (inclusive em volta de hifen) --
 *  a mesma planilha de equipe as vezes vem "Entregue no local- tempo..." e
 *  as vezes "Entregue no local -tempo...", nunca deve depender do espacamento
 *  exato de quem digitou. */
export function normalizarTextoOcorrencia(textoBruto: string): string {
  return textoBruto
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acento
    .replace(/[°ºª]/g, '') // sinal de grau/ordinal ("Nº NF") -- nao e' acento, NFD nao remove
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

// Fix round 1 (item 1): a coluna de NF exigia so' CONTER "nf" no cabecalho
// normalizado -- "Confirmação"/"Informação"/"Conferência" contem "nf" DENTRO
// da propria palavra (coNFirmacao, iNFormacao, coNFerencia) e casavam por
// engano, mesmo sem nenhuma relacao com "numero da nota fiscal". A coluna de
// NF agora exige o cabecalho normalizado IGUAL (nao substring) a um dos
// rotulos conhecidos que a equipe usa de fato.
const ROTULOS_NF = ['nf', 'n f', 'nota fiscal', 'nota', 'numero nf', 'nº nf'].map(normalizarTextoOcorrencia)

function acharColunaExata(headers: string[], rotulos: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    if (rotulos.includes(normalizarTextoOcorrencia(headers[i]))) return i
  }
  return null
}

// Coluna de resolucao continua por SUBSTRING (nao fazia parte do fix) --
// "Resolução"/"Ocorrência"/"Status Operação" sao nomes de coluna inteiros,
// nao palavras onde a substring aparece por acidente como em "nf".
const CANDIDATOS_RESOLUCAO = ['resolu', 'ocorren', 'status opera']

function acharColunaPorSubstring(headers: string[], candidatos: string[]): number | null {
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
  const nf = acharColunaExata(headers, ROTULOS_NF)
  const resolucao = acharColunaPorSubstring(headers, CANDIDATOS_RESOLUCAO)
  if (nf === null || resolucao === null) return null
  return { nf, resolucao }
}

export type ContextoImportacao = { empresa: string; data: string; responsavel: string }

export type NaoMapeada = { linha: number; motivo: string }

const MOTIVO_CELULA_ILEGIVEL_NF = 'célula de NF não pôde ser lida (fórmula/rich text/hyperlink sem valor extraível)'
const MOTIVO_CELULA_ILEGIVEL_RESOLUCAO = 'célula de resolução não pôde ser lida (fórmula/rich text/hyperlink sem valor extraível)'

/** Extrai o texto visivel de um valor de celula do ExcelJS. Celula "normal"
 *  (string/numero/boolean/vazia) sempre da certo. Celula com FORMULA
 *  (`{formula, result}`), RICH TEXT (`{richText: [...]}`) ou HYPERLINK
 *  (`{text, hyperlink}`) sao objetos -- `String(v)` neles vira o inutil
 *  "[object Object]" (Fix round 1, item 2). `null` = forma de objeto que nao
 *  reconhecemos; o chamador NUNCA deve gravar esse valor, so' pular a linha
 *  e reportar. Celula vazia (null/undefined) vira string vazia (nao `null`)
 *  -- continua sendo tratada como "NF vazia", nao como erro de leitura. */
export function extrairTextoCelula(v: unknown): string | null {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    // Hyperlink: {text, hyperlink}. Tambem cobre qualquer objeto que ja' tenha
    // um `text` string direto.
    if (typeof obj.text === 'string') return obj.text
    // Rich text: {richText: [{text, font?}, ...]}.
    if (Array.isArray(obj.richText)) {
      return obj.richText
        .map(parte => (parte && typeof (parte as Record<string, unknown>).text === 'string' ? (parte as Record<string, unknown>).text as string : ''))
        .join('')
    }
    // Formula: {formula, result}. `result` pode por sua vez ser qualquer um
    // dos casos acima (recursivo).
    if ('result' in obj) return extrairTextoCelula(obj.result)
    return null // forma desconhecida -- nunca inventa, deixa o chamador pular
  }
  return null
}

/** `linhas` inclui o cabecalho na posicao 0 (igual uma leitura crua de
 *  planilha, linha por linha, celula por celula ja' passada por
 *  `extrairTextoCelula` -- `null` = celula ilegivel). Pura e testavel por
 *  fixture -- sem tocar em ExcelJS/rede, so' a logica de mapeamento. */
export function montarResolucoesDaPlanilha(
  linhas: (string | null)[][],
  ctx: ContextoImportacao,
): { resolucoes: NovaResolucaoNf[]; naoMapeadas: NaoMapeada[] } {
  const [cabecalhoBruto, ...dados] = linhas
  const cabecalho = (cabecalhoBruto ?? []).map(h => h ?? '')
  const colunas = cabecalho.length > 0 ? detectarColunas(cabecalho) : null
  if (!colunas) {
    throw new Error('Não encontrei as colunas de NF e resolução no cabeçalho da planilha (esperado algo como "NF"/"Nota Fiscal" e "Resolução"/"Ocorrência"/"Status Operação").')
  }

  const resolucoes: NovaResolucaoNf[] = []
  const naoMapeadas: NaoMapeada[] = []

  dados.forEach((linha, i) => {
    const numeroDaLinha = i + 2 // 1-based, +1 pelo cabecalho ja consumido
    const nfCelula = linha[colunas.nf]
    if (nfCelula == null) {
      naoMapeadas.push({ linha: numeroDaLinha, motivo: MOTIVO_CELULA_ILEGIVEL_NF })
      return
    }
    const nf = nfCelula.trim()
    if (!nf) {
      naoMapeadas.push({ linha: numeroDaLinha, motivo: 'NF vazia' })
      return
    }
    const resolucaoCelula = linha[colunas.resolucao]
    if (resolucaoCelula == null) {
      naoMapeadas.push({ linha: numeroDaLinha, motivo: MOTIVO_CELULA_ILEGIVEL_RESOLUCAO })
      return
    }
    const textoResolucao = resolucaoCelula.trim()
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

async function lerPlanilhaComoTexto(path: string): Promise<(string | null)[][]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  const linhas: (string | null)[][] = []
  ws.eachRow(row => {
    const valores = (row.values as unknown[]).slice(1).map(extrairTextoCelula)
    linhas.push(valores)
  })
  return linhas
}

/** Fix round 1, item 3: rodar `--aplicar` duas vezes com a MESMA planilha nao
 *  pode duplicar linha em `kpi_nf_resolucao` (cada resolucao e' um INSERT,
 *  nunca UPDATE -- ver resolucoes.ts). So' precisa gravar de novo se a
 *  vigente ATUAL da NF for diferente em algum dos 4 campos que aparecem no
 *  relatorio; `atual === null` (nenhuma resolucao ainda) sempre precisa
 *  gravar. */
export function resolucaoJaVigente(atual: ResolucaoNfRow | null, nova: NovaResolucaoNf): boolean {
  if (!atual) return false
  return atual.resolucao === nova.resolucao
    && (atual.observacao ?? null) === (nova.observacao ?? null)
    && atual.responsavel === nova.responsavel
    && (atual.placa_executora ?? null) === (nova.placa_executora ?? null)
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

  // Idempotencia (Fix round 1, item 3): so' grava o que de fato mudou em
  // relacao a vigente atual de cada NF -- rodar o mesmo arquivo 2x nao
  // duplica linha.
  const historico = await buscarResolucoes(empresa, data)
  const vigentes = vigentesPorNf(historico)
  let gravadas = 0
  let puladas = 0
  for (const r of resolucoes) {
    if (resolucaoJaVigente(vigentes.get(r.nf) ?? null, r)) { puladas++; continue }
    await registrarResolucao(r)
    gravadas++
  }
  console.log(`\n${gravadas} resolução(ões) gravada(s) em kpi_nf_resolucao, ${puladas} pulada(s) (idempotência: já era a vigente).`)
}

if (process.env.VITEST !== 'true') {
  main().catch(e => { console.error(e); process.exit(1) })
}
