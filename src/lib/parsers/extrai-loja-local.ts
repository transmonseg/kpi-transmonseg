/**
 * Prefixos numéricos de códigos de loja por rede conhecida.
 * Mesma constante de matcher.ts e unitrac-pdf.ts — fonte única a partir daqui.
 */
export const REDE_CODIGO_PREFIX_RE =
  /^(9039|3030|7000|8590|5353|5790|9006|710[0-3]|5600|11623|17659|2384|7012|202)/

const BASE_LOCAL_SHORT = 'BASE BENASSI'
const FORA_LOCAL_SHORT = 'FORA DE BASE'

// "12345 - ROTA ..." é geofence genérico de bairro/região (não loja física).
// \b cobre tanto "ROTA BOTAFOGO" quanto nome reconstituído com cidade antes
// ("Rio de Janeiro - ROTA BOTAFOGO"). Não casa "GAROTA" (sem boundary).
const ROTA_NOME_RE = /\bROTA\b/i

/** Remove padrões de endereço comuns que o Unitrac injeta entre código e nome da loja */
function stripEnderecoNoise(s: string): string {
  return s
    .replace(/\bCEP\s*\d{5}[-]?\d{0,3}\b/gi, '')          // "CEP 21530-900" ou "CEP 21530"
    .replace(/\b\d{5}-\d{3}\b/g, '')                        // CEP formato 12345-678
    .replace(/\b(RJ|SP|MG|RN|BA|PE|CE|GO|DF|PR|RS|SC|ES|AM|PA|MT|MS|TO)\b/g, '') // UFs
    .replace(/\b(BRASIL|BRAZIL)\b/gi, '')
    .replace(/\b\d+\b/g, '')                                 // números soltos
    .replace(/[,;]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Extrai {codigo_loja, nome_loja} de um segmento de local_parada.
 *
 * Suporta três formatos reais do Unitrac:
 *  Formato 1: "CÓDIGO - NOME"                  (padrão — sem ruído)
 *  Formato 2: "CÓDIGO Cidade - UF NOME"        (cidade-UF interposta)
 *  Formato 3: "CÓDIGO endereço, CEP NOME"      (endereço completo interposto)
 *
 * Segurança: Formato 2/3 só ativa quando o código bate REDE_CODIGO_PREFIX_RE,
 * evitando falsos positivos com números aleatórios (CEPs, numerais de rua).
 */
export function extraiLojaLocal(
  texto: string,
  opts?: { exigePrefixoRede?: boolean },
): { codigo_loja: string | null; nome_loja: string | null } {
  const t = texto.trim()

  // Rejeita marcadores que nunca são lojas
  if (t.startsWith(BASE_LOCAL_SHORT) || t.startsWith(FORA_LOCAL_SHORT)) {
    return { codigo_loja: null, nome_loja: null }
  }

  // Formato 1: "CÓDIGO - NOME" (padrão, retro-compatível)
  const exact = t.match(/^(\d+)\s*-\s*(.+)$/)
  if (exact) {
    const nome = exact[2].trim()
    // "2018002 - ROTA BOTAFOGO" é geofence de bairro, não loja física
    if (ROTA_NOME_RE.test(nome)) return { codigo_loja: null, nome_loja: null }
    // Nome precisa de ao menos UMA letra: CEP "21530-900" casa o formato
    // (código=21530, nome="900") mas não é loja. Mesma regra do regex antigo.
    if (!/[A-Za-zÀ-Ýà-ý]/.test(nome)) return { codigo_loja: null, nome_loja: null }
    // Modo strict (fallback de local inteiro): CEPs seguidos de texto
    // ("21530-900, Brasil...") também casam — só aceita prefixo de rede.
    if (opts?.exigePrefixoRede && !REDE_CODIGO_PREFIX_RE.test(exact[1])) {
      return { codigo_loja: null, nome_loja: null }
    }
    return { codigo_loja: exact[1], nome_loja: nome || null }
  }

  // Formato 2/3: código no início com prefixo de rede conhecido, nome no fim
  const codeMatch = t.match(/^(\d{4,})/)
  if (!codeMatch || !REDE_CODIGO_PREFIX_RE.test(codeMatch[1])) {
    return { codigo_loja: null, nome_loja: null }
  }
  const codigo = codeMatch[1]
  const resto = t.slice(codigo.length)
  const semEndereco = stripEnderecoNoise(resto)
  if (!semEndereco || !/[A-Za-zÀ-ý]{3}/.test(semEndereco)) {
    return { codigo_loja: codigo, nome_loja: null }
  }
  // Nome reconstituído que é ROTA genérica ("ROTA BOTAFOGO") não é loja.
  if (ROTA_NOME_RE.test(semEndereco)) return { codigo_loja: null, nome_loja: null }
  return { codigo_loja: codigo, nome_loja: semEndereco }
}

/**
 * Retorna true se o segmento contém uma loja real (código + nome),
 * tolerando endereço interposto.
 * Substitui o antigo: /^\d+\s*-\s*\S/.test(p) && /[A-Za-zÀ-Ýà-ý]/.test(p)
 */
export function temLojaLocal(texto: string, opts?: { exigePrefixoRede?: boolean }): boolean {
  const { codigo_loja, nome_loja } = extraiLojaLocal(texto, opts)
  return codigo_loja !== null && nome_loja !== null
}
