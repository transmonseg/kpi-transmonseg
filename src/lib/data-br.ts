// Data do calendário no fuso de Brasília (America/Sao_Paulo, UTC-3).
// `new Date().toISOString()` devolve a data em UTC — à noite no Brasil isso já
// virou o dia seguinte, mostrando o dia errado no dashboard. Use estes helpers.

export function hojeBR(): string {
  // en-CA formata como YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function mesBR(): string {
  return hojeBR().slice(0, 7) // YYYY-MM
}

// Formata um INSTANTE real (timestamp UTC do banco, ex: gerado_em/created_at) no
// fuso de Brasília. NÃO usar nos horários de entrega — esses já são "BRT mascarado
// como UTC" (ver utils/tempo.ts) e devem usar getUTCHours, não conversão de fuso.
// Aqui o valor é um instante de verdade (now()/toISOString), então convertemos.
export function fmtInstanteBR(
  d: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', ...opts })
}
