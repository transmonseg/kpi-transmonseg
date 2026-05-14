/**
 * Parses Unitrac duration string "0D HH:MM:SS" to seconds.
 */
export function parseDuracaoUnitrac(s: string): number {
  if (!s) return 0
  const m = s.match(/(\d+)D\s+(\d+):(\d+):(\d+)/)
  if (!m) return 0
  const [, dias, hh, mm, ss] = m.map(Number)
  return dias * 86400 + hh * 3600 + mm * 60 + ss
}

export function formataHora(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function formataDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h === 0) return `${m}min`
  return `${h}h${m > 0 ? String(m).padStart(2, '0') + 'min' : ''}`
}

export function diffMinutos(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000)
}
