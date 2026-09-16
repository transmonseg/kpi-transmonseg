import type { LinhaRomaneio, LinhaEscala } from './types'
import { normPlaca } from '@/lib/unitrac-api'

// Formato "PROGRAMAÇÃO JAC (CONGELADO)" (romaneio do pão, pedido da Erica
// 15/09 no grupo KPI AJUSTES) -- extraido via pdf-parse (mesma lib que
// parse-romaneio.ts, sem opcao de layout), o que cola varias colunas sem
// separador confiavel. Ver spec 2026-09-15-motor-confirmacao-romaneio-pao-design.md,
// secao "Risco tecnico", pras amostras reais que motivaram cada regex.
const DATA_RE = /^DATA(\d{2})\/(\d{2})\/(\d{4})$/
const ROMANEIO_RE = /^ROMANEIO(\d+)MOTORISTAAJUDANTE$/
const CARRO_RE = /^CARRO\d+([A-Z].*)$/
// NF sempre 6 digitos nas duas amostras reais (14 e 15/09) -- lookahead
// negativo evita casar com a linha de totais do fim de cada ROMANEIO
// (numeros de QTD/PESO/VALOR colados, ex. "3002162,92073 R$..." tem uma
// sequencia de 7+ digitos antes da virgula, nunca exatamente 6 seguidos
// de letra).
const NF_LINHA_RE = /^(\d{6})(?!\d)(.*)$/

// Bairros que sabidamente ficam fora do municipio do Rio de Janeiro --
// lista curta (so' os vistos nas duas amostras reais). Ampliar sob demanda
// quando aparecer bairro de outro municipio (ver spec, "Fora do escopo").
const BAIRROS_NITEROI = new Set(['BADU', 'PENDOTIBA', 'PIRATININGA', 'ITAIPU'])

function municipioPorBairro(bairro: string): string {
  return BAIRROS_NITEROI.has(bairro.toUpperCase().trim()) ? 'NITEROI' : 'RIO DE JANEIRO'
}

// A linha de motorista+ajudante nunca tem separador confiavel quando os
// dois vem preenchidos ("Ednilson RicaldoniLucas Rafael") -- so' "-"
// isolado (vazio) tem delimitador claro. Ajudante e' informacao de apoio
// no relatorio, nunca entra em nenhuma confirmacao de entrega -- a
// heuristica de transicao minuscula->maiuscula e' melhor esforco
// deliberado (spec, "Fora do escopo"), nao uma garantia.
function splitMotoristaAjudante(linha: string): { motorista: string; ajudante: string } {
  if (linha === '--') return { motorista: '', ajudante: '' }
  if (linha.startsWith('-')) return { motorista: '', ajudante: linha.slice(1).trim() }
  if (linha.endsWith('-')) return { motorista: linha.slice(0, -1).trim(), ajudante: '' }
  const m = linha.match(/^(.+?[a-zà-ÿ])([A-ZÀ-Ÿ].*)$/)
  if (m) return { motorista: m[1].trim(), ajudante: m[2].trim() }
  return { motorista: linha.trim(), ajudante: '' }
}

type ContextoPao = {
  carga: string
  placaRaw: string
  placaNorm: string
  motorista: string
  ajudante: string
  motoristaLido: boolean
}

export type ResultadoParsePao = { linhas: LinhaRomaneio[]; escala: LinhaEscala[] }

function fecharContexto(ctx: ContextoPao | null, destino: string | null, escala: LinhaEscala[]): void {
  if (!ctx || !destino) return
  escala.push({
    carga: ctx.carga,
    placaRaw: ctx.placaRaw,
    placaNorm: ctx.placaNorm,
    destino,
    motorista: ctx.motorista,
    ajudante1: ctx.ajudante || null,
    ajudante2: null,
    pesoKg: null,
    entPlanejado: null,
    nfPlanejado: null,
  })
}

/** Pura -- recebe o texto ja' extraido (pdf-parse) e a data esperada
 *  (YYYY-MM-DD), devolve as entregas no MESMO formato do romaneio Nutry Max
 *  (LinhaRomaneio) mais uma LinhaEscala sintetica por ROMANEIO (evita falso
 *  aviso de "sem escala" -- ver spec, secao 3). Lanca erro claro se a data
 *  do cabecalho do PDF nao bater com `data`, ou se nao achar cabecalho
 *  nenhum de DATA (PDF errado). */
export function parsePaoTexto(texto: string, data: string): ResultadoParsePao {
  const linhas: LinhaRomaneio[] = []
  const escala: LinhaEscala[] = []
  let ctx: ContextoPao | null = null
  let destinoPrimeiraEntrega: string | null = null
  let dataConfirmada = false

  for (const raw of texto.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const d = line.match(DATA_RE)
    if (d) {
      const dataArquivo = `${d[3]}-${d[2]}-${d[1]}`
      if (dataArquivo !== data) {
        throw new Error(`Romaneio do Pão é do dia ${dataArquivo}, mas o relatório pedido é de ${data}. Confira se subiu o arquivo certo.`)
      }
      dataConfirmada = true
      continue
    }

    const r = line.match(ROMANEIO_RE)
    if (r) {
      fecharContexto(ctx, destinoPrimeiraEntrega, escala)
      ctx = { carga: `PAO-${r[1]}`, placaRaw: '', placaNorm: '', motorista: '', ajudante: '', motoristaLido: false }
      destinoPrimeiraEntrega = null
      continue
    }
    if (!ctx) continue

    const c = line.match(CARRO_RE)
    if (c) {
      ctx.placaRaw = c[1].trim()
      ctx.placaNorm = normPlaca(c[1])
      continue
    }

    if (ctx.placaRaw && !ctx.motoristaLido) {
      const ma = splitMotoristaAjudante(line)
      ctx.motorista = ma.motorista
      ctx.ajudante = ma.ajudante
      ctx.motoristaLido = true
      continue
    }

    const nf = line.match(NF_LINHA_RE)
    if (!nf) continue // ORDEM isolado, cabecalho de coluna, linha de total -- ignora sem erro

    const partes = nf[2].split(/\s{2,}/).map(s => s.trim()).filter(Boolean)
    // Menos de 3 pedacos, ou primeiro pedaco sem nenhuma letra: e' a linha
    // de total (numeros colados), nao uma entrega de verdade -- ignora.
    if (partes.length < 3 || !/[A-Za-zÀ-ÿ]/.test(partes[0])) continue

    const [clienteNome, enderecoRua, bairro] = partes
    const municipio = municipioPorBairro(bairro)
    if (destinoPrimeiraEntrega === null) destinoPrimeiraEntrega = bairro

    linhas.push({
      carga: ctx.carga,
      destino: destinoPrimeiraEntrega,
      placa: ctx.placaRaw,
      motorista: ctx.motorista,
      ajudantes: ctx.ajudante ? [ctx.ajudante] : [],
      nf: nf[1],
      clienteCodigo: nf[1],
      clienteNome,
      // Formato compativel com a cascata de geocode/guarda territorial ja'
      // existente (mesmo formato de kpi_romaneio_geocode_cache): "RUA/NUM
      // - BAIRRO, CIDADE - COMPLEMENTO". `enderecoRua` ja' vem com rua e
      // numero juntos do proprio documento (as vezes colados de forma
      // estranha, ver spec "Risco tecnico") -- passa adiante como veio,
      // nunca tenta adivinhar onde cortar um numero ambiguo.
      endereco: `${enderecoRua} - ${bairro}, ${municipio} - *`,
    })
  }
  fecharContexto(ctx, destinoPrimeiraEntrega, escala)

  if (!dataConfirmada) {
    throw new Error('Romaneio do Pão sem cabeçalho de data (linha "DATA dd/mm/aaaa") -- confira se é o PDF certo.')
  }

  return { linhas, escala }
}

export async function parsePao(buffer: Buffer, data: string): Promise<ResultadoParsePao> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
  const { text } = await pdfParse(buffer)
  return parsePaoTexto(text, data)
}
