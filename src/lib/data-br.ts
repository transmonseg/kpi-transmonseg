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
