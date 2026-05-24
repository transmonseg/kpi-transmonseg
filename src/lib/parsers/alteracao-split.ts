/**
 * Divide um bloco de texto em múltiplas alterações.
 *
 * Detecta início de alteração quando uma linha:
 *  - Contém palavra "alteração" (header de rede)
 *  - É "filial NNN" (formato zona sul)
 *  - Começa com nome de rede conhecida (Carrefour, Prezunic, Sams Club, etc.)
 *
 * Tolera bullets/marcadores (-, •, ▪, *) no início da linha.
 * Carrega o contexto de rede (redeCtx) para os blocos seguintes que são "filial N".
 *
 * Robustez ao input livre de WhatsApp/email: cada linha que pareça novo cabeçalho
 * de loja inicia novo bloco, mesmo sem a palavra "Alteração" explícita.
 */

const PREFIXOS_REDE = [
  'carrefour', 'prezunic', 'princesa', "sam's", 'sams club', 'sams ',
  'vianen', 'sendas', 'guanabara', 'super pax', 'superpax',
  'feira nova', 'emanuel', 'armazém do grão', 'armazem do grao',
  'armaz', 'assaí', 'assai', 'atacad', 'mundial',
  'super prix', 'superprix', 'cab petropolis', 'cab petrópolis',
  'zona sul', 'mega box',
]

// Palavras que sinalizam que a linha é uma CONTINUAÇÃO (label entra/sai/motivo no INÍCIO),
// não cabeçalho de nova alteração.
const LABEL_CONTINUACAO_RE = /^\s*(entra|sai|placa\s+(entra|sai)|motorista\s+(entra|sai)|motivo|obs)\s*[:\-]/i

function removeMarcadorBullet(s: string): string {
  return s.replace(/^[-—–•▪►*▶▸·•\s]+/, '')
}

function temPrefixoRede(linhaLower: string): boolean {
  return PREFIXOS_REDE.some(p => linhaLower.startsWith(p))
}

function ehInicioBlocoAlteracao(linha: string): boolean {
  const trim = linha.trim()
  if (!trim) return false
  // Caso 1: "Alteração..."
  if (/(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]*)?altera[çc][aã]o/iu.test(trim)) return true
  // Caso 2: "Filial NNN" sozinho
  if (/^\s*filial\s+\d+\s*$/i.test(trim)) return true
  // Caso 3: linha começa com nome de rede conhecida (após remover bullet).
  // Importante: só vale se a linha NÃO começar com label de continuação ("entra:", "sai:", etc).
  const semBullet = removeMarcadorBullet(trim)
  if (LABEL_CONTINUACAO_RE.test(semBullet)) return false
  const limpa = semBullet.toLowerCase()
  if (temPrefixoRede(limpa)) return true
  return false
}

function ehRedeHeaderPuro(linha: string): boolean {
  // Cabeçalho geral de rede ("Alteração Carrefour"), sem ser "Filial N"
  return (
    /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]*)?altera[çc][aã]o/iu.test(linha) &&
    !/^\s*filial\s+\d+\s*$/i.test(linha.trim())
  )
}

export function splitAlteracoes(texto: string): string[] {
  const linhas = texto.split(/\r?\n/)
  const blocos: string[] = []
  let buffer: string[] = []
  let redeCtx = ''

  for (const linha of linhas) {
    const trim = linha.trim()
    if (!trim && buffer.length === 0) continue

    if (ehInicioBlocoAlteracao(trim)) {
      if (buffer.length > 0) {
        blocos.push(buffer.join('\n').trim())
        buffer = []
      }
      if (ehRedeHeaderPuro(trim)) {
        redeCtx = trim
        buffer.push(linha)
      } else {
        // Filial N ou linha começando com rede: anexar redeCtx pra ajudar detecção
        if (redeCtx) buffer.push(redeCtx)
        buffer.push(linha)
      }
    } else {
      buffer.push(linha)
    }
  }
  if (buffer.length > 0) blocos.push(buffer.join('\n').trim())

  const clean = blocos.map(s => s.trim()).filter(Boolean)
  return clean.length > 0 ? clean : [texto.trim()]
}
