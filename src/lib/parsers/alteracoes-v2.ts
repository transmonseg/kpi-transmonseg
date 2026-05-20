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
