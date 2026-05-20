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
const ALTERACAO_RE = /^\s*(?:ALTERA[ÇC][AÃ]O|COMUNICADO)\s*[:\-]?/i

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

  // Segmenta em blocos por marcadores (Filial N, ALTERAÇÃO/COMUNICADO, linha em branco)
  const blocos: string[] = []
  let buffer: string[] = []

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    const trimmed = linha.trim()

    const ehFilial = FILIAL_RE.test(linha)
    const ehAlteracao = ALTERACAO_RE.test(linha)
    const ehVazia = trimmed === ''

    if ((ehFilial || ehAlteracao || ehVazia) && buffer.length > 0) {
      blocos.push(buffer.join('\n').trim())
      buffer = []
    }

    if (!ehVazia) {
      buffer.push(linha)
    }
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
