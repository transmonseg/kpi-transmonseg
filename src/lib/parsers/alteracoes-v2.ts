import type { AlteracaoBloco, ParseContext } from './alteracoes-v2.types'
import { lookupSlot } from './lookup-canonical'

export function normalizaNomeMotorista(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (combining diacritical marks)
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function normalizaTexto(texto: string): string {
  if (!texto) return ''
  let t = texto
  // Remove emojis (BMP supplementary + diversos símbolos)
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
  // Padroniza quebras de linha
  t = t.replace(/\r\n|\r/g, '\n')
  // Insere quebra antes de "Filial N" se não houver
  t = t.replace(/([^\n])\s+(?=Filial\s+\d)/gi, '$1\n')
  // Insere quebra antes de "Sai:" / "Entra:" se não houver
  // (mas não quando o token anterior é um número de filial)
  t = t.replace(/([^\n\d])\s+(?=(?:Sai|Entra|Saiu|Entrou)\s*:)/gi, '$1\n')
  // Colapsa espaços/tabs preservando \n
  t = t.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
  // Remove linhas vazias no início/fim
  t = t.replace(/^\n+/, '').replace(/\n+$/, '')
  return t
}

const FILIAL_RANGE_RE = /Filial\s+(\d+)\s*\/\s*(\d+)/i
const FILIAL_RE = /^\s*Filial\s+\d+\s*$/i
const ALTERACAO_RE = /^\s*(?:ALTERA[ÇC][AÃ]O|COMUNICADO|SUBSTITUI[ÇC][AÃ]O)\s*[:\-]?/i

// Linhas que indicam INÍCIO de uma nova alteração (não devem continuar bloco anterior)
const INICIO_BLOCO_RE = new RegExp(
  '^(?:' +
  '\\s*🚨|' +  // emoji bandeira
  '\\s*(?:ALTERA[ÇC][AÃ]O|COMUNICADO|SUBSTITUI[ÇC][AÃ]O)\\b|' +
  '\\s*Filial\\s+\\d|' +
  // Nome de rede (potencial título de loja)
  '\\s*(?:ASSA[IÍ]|PREZUNIC|CARREFOUR|SUPERPRIX|SENDAS|ZONA\\s*SUL|ARMAZ[EÉ]M|PRINCESA|GUANABARA|SUPER\\s*PAX|EMANUEL|FEIRA\\s*NOVA|ATACAD[AÃ]O|VIANENSE|SAM\\\'?S|MUNDIAL|CAB\\b)' +
  ')',
  'i',
)

// Linhas que CONTINUAM o bloco anterior (entra/sai/etc)
const CONTINUACAO_RE = /^\s*(?:sai|entra|saiu|entrou|cod|c[óo]digo|placa|motivo|obs|observa[çc][aã]o|carro|motorista|troca\s+de\s+carro)\s*[:\-]?/i

function expandeFilialRange(bloco: string): string[] {
  const linhas = bloco.split('\n')
  for (let i = 0; i < linhas.length; i++) {
    const m = FILIAL_RANGE_RE.exec(linhas[i])
    if (m) {
      const linhaA = linhas[i].replace(m[0], `Filial ${m[1]}`)
      const linhaB = linhas[i].replace(m[0], `Filial ${m[2]}`)
      const linhasA = [...linhas]
      const linhasB = [...linhas]
      linhasA[i] = linhaA
      linhasB[i] = linhaB
      return [linhasA.join('\n'), linhasB.join('\n')]
    }
  }
  return [bloco]
}

export function segmentaBlocos(textoNormalizado: string): string[] {
  if (!textoNormalizado.trim()) return []

  const linhas = textoNormalizado.split('\n')

  // Segmenta em blocos por marcadores de INÍCIO (Filial N, ALTERAÇÃO, nome
  // de rede). Linhas em branco SÓ quebram bloco se a próxima linha não-vazia
  // for outro início — caso contrário são separadores internos (entre Entra
  // e Sai por exemplo).
  const blocos: string[] = []
  let buffer: string[] = []

  // Encontra próxima linha não-vazia a partir de um índice
  const proximaNaoVazia = (idx: number): string | null => {
    for (let j = idx + 1; j < linhas.length; j++) {
      const t = linhas[j].trim()
      if (t) return t
    }
    return null
  }

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    const trimmed = linha.trim()

    const ehFilial = FILIAL_RE.test(linha)
    const ehAlteracao = ALTERACAO_RE.test(linha)
    const ehInicioRede = INICIO_BLOCO_RE.test(linha) && !CONTINUACAO_RE.test(linha)
    const ehVazia = trimmed === ''

    // Linha vazia: só quebra se a próxima linha não-vazia for início de novo bloco
    if (ehVazia && buffer.length > 0) {
      const prox = proximaNaoVazia(i)
      if (prox && INICIO_BLOCO_RE.test(prox) && !CONTINUACAO_RE.test(prox)) {
        blocos.push(buffer.join('\n').trim())
        buffer = []
      }
      // senão: é separador interno (entre Entra/Sai) — ignora a linha vazia
      continue
    }

    // Marcador explícito de novo bloco quebra
    if ((ehFilial || ehAlteracao || ehInicioRede) && buffer.length > 0) {
      blocos.push(buffer.join('\n').trim())
      buffer = []
    }

    buffer.push(linha)
  }
  if (buffer.length > 0) {
    blocos.push(buffer.join('\n').trim())
  }

  // Expande "Filial 45/47" em dois blocos espelho
  const blocosExpandidos: string[] = []
  for (const b of blocos) {
    blocosExpandidos.push(...expandeFilialRange(b))
  }

  // Filtra blocos sem conteúdo útil
  return blocosExpandidos.filter((b) => {
    return /[a-z]/i.test(b) && (
      /\b[A-Z]{3}[\s-]?\d/.test(b) ||
      /sai|entra|substitui|trocou/i.test(b.toLowerCase())
    )
  })
}

const PLACA_RE_GLOBAL = /\b([A-Z]{3})[\s-]?(\d[A-Z0-9]\d{2}|\d{4})\b/gi
const CODIGO_RE_GLOBAL = /(?<![A-Z0-9])(\d{3,6})(?![A-Z0-9])/g

export interface TokensExtraidos {
  placas: string[]
  codigos: number[]
  textoSemTokens: string
}

export function extraiTokens(trecho: string): TokensExtraidos {
  if (!trecho) return { placas: [], codigos: [], textoSemTokens: '' }

  const placas: string[] = []
  const placasFound: string[] = []

  let textoSem = trecho
  let m: RegExpExecArray | null
  const placaRe = new RegExp(PLACA_RE_GLOBAL.source, 'gi')
  while ((m = placaRe.exec(trecho)) !== null) {
    const placaNorm = (m[1] + m[2]).toUpperCase()
    if (!placas.includes(placaNorm)) placas.push(placaNorm)
    placasFound.push(m[0])
  }
  for (const p of placasFound) {
    textoSem = textoSem.replace(p, ' ')
  }

  const codigos: number[] = []
  const codRe = new RegExp(CODIGO_RE_GLOBAL.source, 'g')
  while ((m = codRe.exec(textoSem)) !== null) {
    const n = parseInt(m[1], 10)
    if (!isNaN(n) && !codigos.includes(n)) codigos.push(n)
  }
  for (const n of codigos) {
    textoSem = textoSem.replace(new RegExp(`\\b${n}\\b`, 'g'), ' ')
  }

  return {
    placas,
    codigos,
    textoSemTokens: textoSem.replace(/\s+/g, ' ').trim(),
  }
}

export interface SentidoExtraido {
  sai: string | null
  entra: string | null
}

export function detectaSentido(blocoNormalizado: string): SentidoExtraido {
  if (!blocoNormalizado) return { sai: null, entra: null }

  const linhas = blocoNormalizado.split('\n').map((l) => l.trim())
  let sai: string | null = null
  let entra: string | null = null

  for (const linha of linhas) {
    if (/^sai[uo]?\s*:/i.test(linha) && !sai) {
      sai = linha.replace(/^sai[uo]?\s*:\s*/i, '').trim()
    } else if (/^entr[ao]u?\s*:/i.test(linha) && !entra) {
      entra = linha.replace(/^entr[ao]u?\s*:\s*/i, '').trim()
    }
  }

  if (!sai || !entra) {
    const inline = blocoNormalizado.replace(/\n/g, ' ')
    const mSai = /\bsai[uo]?\s+(.+?)(?=\b(?:entr|motivo|obs)\b|$)/i.exec(inline)
    const mEntra = /\bentr[ao]u?\s+(.+?)(?=\b(?:sai|motivo|obs)\b|$)/i.exec(inline)
    if (!sai && mSai) sai = mSai[1].trim()
    if (!entra && mEntra) entra = mEntra[1].trim()
  }

  return { sai, entra }
}

const REDE_MAP: Array<{ pat: string; id: string }> = [
  { pat: 'prezunic', id: 'PREZUNIC' },
  { pat: 'princesa', id: 'PRINCESA' },
  { pat: 'carrefour', id: 'CARREFOUR' },
  { pat: 'assa', id: 'ASSAI' },
  { pat: 'atacad', id: 'ATACADAO' },
  { pat: 'super prix', id: 'SUPERPRIX' },
  { pat: 'superprix', id: 'SUPERPRIX' },
  { pat: "sam's", id: 'SAMS_CLUB' },
  { pat: 'sams club', id: 'SAMS_CLUB' },
  { pat: 'vianen', id: 'VIANENSE' },
  { pat: 'sendas', id: 'SENDAS' },
  { pat: 'guanabara', id: 'GUANABARA' },
  { pat: 'super pax', id: 'SUPER_PAX' },
  { pat: 'superpax', id: 'SUPER_PAX' },
  { pat: 'feira nova', id: 'FEIRA_NOVA' },
  { pat: 'emanuel', id: 'EMANUEL' },
  { pat: 'armaz', id: 'ARMAZEM_GRAO' },
  { pat: 'zona sul', id: 'ZONA_SUL' },
  { pat: 'mega box', id: 'ZONA_SUL' },
  { pat: 'mundial', id: 'MUNDIAL' },
  { pat: 'cab petropolis', id: 'CAB_PETROPOLIS' },
  { pat: 'cab_petropolis', id: 'CAB_PETROPOLIS' },
]

const FILIAL_NUM_RE = /Filial\s+(\d+)/i
const MOTIVO_LABEL_RE = /^\s*(?:motivo|obs)\s*\.?\s*[:]?\s*(.+)$/i
const QUEBROU_RE = /(carro\s+quebrou|pneu\s+furou|caminh[aã]o\s+quebrou|bateria\s+ruim|teclado\s+apagou|troca\s+de\s+carro|acidente|passou\s+mal|folga|falta)/i

export interface ContextoExtraido {
  rede_id: string | null
  loja_nome_raw: string | null
  filial: number | null
  motivo: string | null
}

export function detectaContexto(
  blocoNormalizado: string,
  lojas: ParseContext['lojas'],
): ContextoExtraido {
  const linhas = blocoNormalizado.split('\n').map((l) => l.trim()).filter(Boolean)

  let rede_id: string | null = null
  const blocoLower = blocoNormalizado.toLowerCase()
  for (const { pat, id } of REDE_MAP) {
    if (blocoLower.includes(pat)) { rede_id = id; break }
  }

  let filial: number | null = null
  const mFilial = FILIAL_NUM_RE.exec(blocoNormalizado)
  if (mFilial) filial = parseInt(mFilial[1], 10)

  // Fallback: texto com "Filial N" mas sem rede identificada → ZONA_SUL
  if (!rede_id && filial !== null) rede_id = 'ZONA_SUL'

  let loja_nome_raw: string | null = null
  for (const linha of linhas) {
    if (/^sai[uo]?\s*:/i.test(linha)) continue
    if (/^entr[ao]u?\s*:/i.test(linha)) continue
    if (MOTIVO_LABEL_RE.test(linha)) continue
    if (FILIAL_NUM_RE.test(linha) && !linha.match(/sai|entra/i)) {
      loja_nome_raw = linha
      continue
    }
    const lower = linha.toLowerCase()
    if (rede_id) {
      const matches = REDE_MAP.find((r) => r.id === rede_id && lower.includes(r.pat))
      if (matches) { loja_nome_raw = linha; break }
    } else {
      const matches = REDE_MAP.find((r) => lower.includes(r.pat))
      if (matches) { loja_nome_raw = linha; break }
    }
  }
  // silenciar lojas: argumento exigido pela assinatura, uso futuro em lookupSlot
  void lojas

  let motivo: string | null = null
  for (const linha of linhas) {
    const m = MOTIVO_LABEL_RE.exec(linha)
    if (m) { motivo = m[1].replace(/^[.:\-\s]+/, '').trim(); break }
  }
  if (!motivo) {
    const mQ = QUEBROU_RE.exec(blocoNormalizado)
    if (mQ) motivo = mQ[1]
  }

  return { rede_id, loja_nome_raw, filial, motivo }
}

export function parseAlteracoesV2(texto: string, ctx: ParseContext): AlteracaoBloco[] {
  const norm = normalizaTexto(texto)
  const blocosTextuais = segmentaBlocos(norm)
  return blocosTextuais.map((bt) => parseBloco(bt, ctx))
}

function parseBloco(blocoTexto: string, ctx: ParseContext): AlteracaoBloco {
  const sentido = detectaSentido(blocoTexto)
  const contexto = detectaContexto(blocoTexto, ctx.lojas)

  const saiSlot = sentido.sai ? slotFromTrecho(sentido.sai, ctx) : null
  const entraSlot = sentido.entra ? slotFromTrecho(sentido.entra, ctx) : null

  const warnings: string[] = []
  if (!sentido.sai) warnings.push('Sai não identificado')
  if (!sentido.entra) warnings.push('Entra não identificado')
  if (saiSlot && !saiSlot.motorista_nome) warnings.push('Sai: motorista não encontrado no banco')
  if (entraSlot && !entraSlot.motorista_nome) warnings.push('Entra: motorista não encontrado no banco')
  if (!contexto.rede_id) warnings.push('Rede não identificada')

  let confianca: 'alta' | 'media' | 'baixa' = 'baixa'
  const slotsOk = (saiSlot?.placa_norm ? 1 : 0) + (entraSlot?.placa_norm ? 1 : 0)
  if (contexto.rede_id && slotsOk === 2) confianca = 'alta'
  else if (contexto.rede_id && slotsOk >= 1) confianca = 'media'

  return {
    rede_id: contexto.rede_id,
    loja_nome_raw: contexto.loja_nome_raw,
    filial: contexto.filial,
    sai: saiSlot,
    entra: entraSlot,
    motivo: contexto.motivo,
    confianca,
    warnings,
    raw: blocoTexto,
  }
}

function slotFromTrecho(trecho: string, ctx: ParseContext) {
  const tokens = extraiTokens(trecho)
  const nomeHint = normalizaNomeMotorista(tokens.textoSemTokens)
  return lookupSlot(
    { placas: tokens.placas, codigos: tokens.codigos, nomeHint },
    ctx,
    { preferNome: true },
  )
}
