/**
 * Horário de entrega pelo GABARITO da API. O relatório Unitrac (PDF) às vezes marca
 * uma passagem rápida (drive-by) perto da loja como "chegada", em vez da parada real
 * de entrega. Quando a API confirma a entrega na mesma loja e o horário diverge mais
 * que `toleranciaMin`, a API ganha (parada consolidada por geofence + duração).
 * Divergência pequena → mantém o PDF (fonte primária da Tia Érica).
 */
export function horarioEntregaGabarito(chegadaPdf: Date, chegadaApi: Date | null, toleranciaMin = 15): Date {
  if (!chegadaApi) return chegadaPdf
  const diffMin = Math.abs(chegadaApi.getTime() - chegadaPdf.getTime()) / 60_000
  return diffMin > toleranciaMin ? chegadaApi : chegadaPdf
}
