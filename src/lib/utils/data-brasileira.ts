/** Parses "DD/MM/YYYY" → Date */
export function parseDataBR(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mo, a] = m
  return new Date(Number(a), Number(mo) - 1, Number(d))
}

/** Formats Date → "DD/MM/YYYY" */
export function formataDataBR(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Formats Date → "YYYY-MM-DD" */
export function formataDataISO(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${yyyy}-${mm}-${dd}`
}

/** Returns next business day (Mon–Sat, skips Sundays) */
export function proximoDiaUtil(d: Date): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + 1)
  // Skip Sunday
  if (next.getDay() === 0) next.setDate(next.getDate() + 1)
  return next
}

export function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}
