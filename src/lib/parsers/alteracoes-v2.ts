export function normalizaNomeMotorista(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (combining diacritical marks)
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
}
