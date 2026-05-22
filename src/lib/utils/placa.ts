const RE_ANTIGA   = /^[A-Z]{3}[0-9]{4}$/
const RE_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/

// Pares letra↔dígito que o OCR do PDF do HLOG/Unitrac confunde na pos-4
// (única posição onde antiga tem dígito e Mercosul tem letra).
// Mapa: LETRA → dígito visualmente parecido.
// B↔1, E↔4, G↔6, H↔7, I↔8, J↔9, O↔0, S↔5, Z↔2.
const OCR_DIGIT_FROM_LETTER: Record<string, string> = {
  B: '1', E: '4', G: '6', H: '7', I: '8', J: '9', O: '0', S: '5', Z: '2',
}

export function normalizaPlaca(p: string | null | undefined): string {
  if (!p) return ''
  return String(p).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function placaValida(p: string | null | undefined): boolean {
  const n = normalizaPlaca(p)
  return RE_ANTIGA.test(n) || RE_MERCOSUL.test(n)
}

export function formatPlacaDisplay(p: string | null | undefined): string {
  const n = normalizaPlaca(p)
  if (n.length === 7) return `${n.slice(0, 3)}-${n.slice(3)}`
  return n
}

/**
 * Gera as variantes OCR-confusas de uma placa na 4ª posição.
 * - Antiga `ABC1234` com dígito {0,1,2,4,5,6,7,8,9} na pos-4 → variante Mercosul.
 * - Mercosul `ABC1D23` com letra {B,E,G,H,I,J,O,S,Z} na pos-4 → variante antiga.
 * Retorna sempre incluindo a forma original. Limita à pos-4 (única ambígua).
 */
export function ocrVariantesPlaca(p: string): string[] {
  const n = normalizaPlaca(p)
  if (n.length !== 7) return [n]
  const out = new Set<string>([n])
  const ch = n[4]
  // Letra Mercosul → variante antiga (dígito)
  const digit = OCR_DIGIT_FROM_LETTER[ch]
  if (digit) out.add(n.slice(0, 4) + digit + n.slice(5))
  // Dígito antiga → variante Mercosul (letra)
  for (const [letra, dig] of Object.entries(OCR_DIGIT_FROM_LETTER)) {
    if (dig === ch) out.add(n.slice(0, 4) + letra + n.slice(5))
  }
  return [...out]
}

/**
 * Corrige confusão OCR na 4ª posição quando uma placa parseada do PDF pode
 * ser tanto antiga (`ABC1234`) quanto Mercosul (`ABC1D23`) e a pos-4 está em
 * `{B,E,G,H,I,J,O,S,Z}` (letras visualmente parecidas com dígitos).
 *
 * Estratégia:
 *   1. Se já é antiga válida, retorna sem mexer.
 *   2. Se NÃO bate em Mercosul (ex: lixo), retorna normalizado.
 *   3. Se pos-4 NÃO está no conjunto OCR-confusável, é Mercosul real → mantém.
 *   4. Quando ambas formas são sintaticamente válidas:
 *      - Se cadastro contém SÓ a forma antiga → corrige.
 *      - Se cadastro contém SÓ a forma Mercosul → mantém (real Mercosul).
 *      - Se cadastro contém ambas ou nenhuma → mantém o que veio (sem chute).
 *
 * O cadastro DEVE ser uma fonte limpa (ex: placas conhecidas de XLSX, que não
 * sofre OCR, ou histórico do banco). Sem cadastro, nunca corrige — evita
 * over-correction de placas Mercosul reais com pos-4 ∈ {B,E,...}.
 */
export function corrigeOcrPlaca(
  raw: string | null | undefined,
  cadastro?: ReadonlySet<string> | null,
): string {
  const n = normalizaPlaca(raw)
  if (n.length !== 7) return n
  if (RE_ANTIGA.test(n)) return n
  if (!RE_MERCOSUL.test(n)) return n
  const letra = n[4]
  const digito = OCR_DIGIT_FROM_LETTER[letra]
  if (!digito) return n // Mercosul com pos-4 não-confusável → real
  const variantAntiga = n.slice(0, 4) + digito + n.slice(5)
  if (!RE_ANTIGA.test(variantAntiga)) return n
  if (!cadastro || cadastro.size === 0) return n // sem evidência → não chuta
  const temAntiga = cadastro.has(variantAntiga)
  const temMercosul = cadastro.has(n)
  if (temAntiga && !temMercosul) return variantAntiga
  return n
}
