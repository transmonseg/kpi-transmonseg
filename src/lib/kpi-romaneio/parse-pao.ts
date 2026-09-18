import type { LinhaRomaneio, LinhaEscala } from './types'
import { normPlaca } from '@/lib/unitrac-api'
import { PAO_PREFIXO } from './constants'

// Formato "PROGRAMAÇÃO JAC (CONGELADO)" (romaneio do pão, pedido da Erica
// 15/09 no grupo KPI AJUSTES) -- extraido via pdf-parse (mesma lib que
// parse-romaneio.ts, sem opcao de layout), o que cola varias colunas sem
// separador confiavel. Ver spec 2026-09-15-motor-confirmacao-romaneio-pao-design.md,
// secao "Risco tecnico", pras amostras reais que motivaram cada regex.
const DATA_RE = /^DATA(\d{2})\/(\d{2})\/(\d{4})$/
const ROMANEIO_RE = /^ROMANEIO(\d+)MOTORISTAAJUDANTE$/
const CARRO_RE = /^CARRO\d+([A-Z].*)$/
// Fix (revisao final de branch 15/09, Important 5): quando a coluna CARRO
// vem com a placa EM BRANCO no documento, o pdf-parse emite so' "CARRO36"
// (nada pra colar depois do numero) -- CARRO_RE nao casa e, sem esta
// segunda regex, a linha do CARRO seria consumida como se fosse a linha de
// motorista, perdendo o motorista de verdade que vem logo abaixo.
const CARRO_SEM_PLACA_RE = /^CARRO\d*$/
// Cabecalho de coluna do bloco de entregas -- marca o fim da area de
// identificacao (CARRO/motorista). Nunca pode ser lido como motorista.
const ORDEM_HEADER_RE = /^ORDEM/
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
      ctx = { carga: `${PAO_PREFIXO}${r[1]}`, placaRaw: '', placaNorm: '', motorista: '', ajudante: '', motoristaLido: false }
      destinoPrimeiraEntrega = null
      continue
    }
    if (!ctx) continue

    const c = line.match(CARRO_RE)
    if (c) {
      const resto = c[1].trim()
      // Fix (revisao final 15/09, Important 5): com a placa em branco o
      // pdf-parse pode colar a linha de motorista logo depois do numero do
      // carro ("CARRO36Luis Paulo-"). Placa real NUNCA tem minuscula --
      // discriminador seguro pra nao gravar um nome de pessoa como placa.
      if (/[a-zà-ÿ]/.test(resto)) {
        const ma = splitMotoristaAjudante(resto)
        ctx.motorista = ma.motorista
        ctx.ajudante = ma.ajudante
        ctx.motoristaLido = true
        console.warn(`[parse-pao] ${ctx.carga}: CARRO sem placa no documento -- motorista lido da propria linha do CARRO: ${JSON.stringify(resto)}`)
        continue
      }
      ctx.placaRaw = resto
      ctx.placaNorm = normPlaca(resto)
      continue
    }
    if (CARRO_SEM_PLACA_RE.test(line)) {
      // Placa em branco no documento: segue com placaRaw '' (a carga sai
      // como "SEM PLACA" no relatorio, ver gerador-xlsx.ts), mas o bloco
      // continua valido -- o motorista da linha seguinte NAO se perde mais.
      console.warn(`[parse-pao] ${ctx.carga}: bloco CARRO sem placa preenchida (${JSON.stringify(line)}) -- carga sai sem placa`)
      continue
    }
    if (ORDEM_HEADER_RE.test(line)) {
      ctx.motoristaLido = true
      continue
    }

    // Fix (revisao final 15/09, Important 5): a leitura do motorista era
    // condicionada a `ctx.placaRaw` -- bloco com placa em branco perdia
    // TAMBEM o motorista, mesmo estando no PDF. Agora so' o flag de posicao
    // (`motoristaLido`, junto com a guarda de ORDEM acima) decide.
    if (!ctx.motoristaLido) {
      const ma = splitMotoristaAjudante(line)
      ctx.motorista = ma.motorista
      ctx.ajudante = ma.ajudante
      ctx.motoristaLido = true
      continue
    }

    const nf = line.match(NF_LINHA_RE)
    if (!nf) {
      // Fix (revisao final 15/09, Important 4): descarte silencioso. ORDEM
      // isolado, cabecalho de coluna e linha de total caem aqui legitimamente
      // (nao geram ruido), mas uma linha que PARECE entrega -- comeca com
      // numero de documento, tem colunas separadas por 2+ espacos e texto --
      // e' descarte suspeito e precisa deixar rastro pra diagnostico manual.
      if (/^\d{4,}/.test(line) && /\s{2,}/.test(line) && /[A-Za-zÀ-ÿ]/.test(line)) {
        console.warn(`[parse-pao] ${ctx.carga}: linha de entrega descartada -- NF fora do padrao de 6 digitos: ${JSON.stringify(line)}`)
      }
      continue
    }

    const partes = nf[2].split(/\s{2,}/).map(s => s.trim()).filter(Boolean)
    // Menos de 3 pedacos, ou primeiro pedaco sem nenhuma letra: e' a linha
    // de total (numeros colados), nao uma entrega de verdade -- ignora.
    if (partes.length < 3 || !/[A-Za-zÀ-ÿ]/.test(partes[0])) {
      // Fix (revisao final 15/09, Important 4): linha de total comeca por
      // numero/pontuacao (",99317.799,61R$"); nome de cliente sempre comeca
      // por letra -- so' esta segunda forma e' descarte suspeito.
      if (partes.length > 0 && /^[A-Za-zÀ-ÿ]/.test(partes[0])) {
        console.warn(`[parse-pao] ${ctx.carga}: linha de entrega descartada -- formato inesperado (${partes.length} coluna(s)): ${JSON.stringify(line)}`)
      }
      continue
    }

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
