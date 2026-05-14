const RE_ANTIGA   = /^[A-Z]{3}[0-9]{4}$/
const RE_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/

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
