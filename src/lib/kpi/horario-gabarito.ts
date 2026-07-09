/**
 * Horário de entrega pelo GABARITO da API. O relatório Unitrac (PDF) às vezes marca
 * uma passagem rápida (drive-by) perto da loja como "chegada", em vez da parada real
 * de entrega. Quando a API confirma a entrega na mesma loja e o horário diverge mais
 * que `toleranciaMin`, a API ganha (parada consolidada por geofence + duração).
 * Divergência pequena → mantém o PDF (fonte primária da Tia Érica).
 *
 * `chegadaPdfEstendida`: a chegada do PDF veio da extensão por cadeia FORA_BASE
 * (fila/pátio colado na loja, presença física contínua verificada a <300m). Nesse
 * caso, se o PDF é MAIS CEDO que a API, o PDF ganha — não é drive-by, é o caminhão
 * esperando fora da cerca antes de entrar (caso FKY-8H51 06/07: chegou 05:29 na
 * fila, entrou na geofence 06:35; o gabarito atropelava o 05:29 correto).
 */
export function horarioEntregaGabarito(
  chegadaPdf: Date,
  chegadaApi: Date | null,
  toleranciaMin = 15,
  chegadaPdfEstendida = false,
): Date {
  if (!chegadaApi) return chegadaPdf
  if (chegadaPdfEstendida && chegadaPdf.getTime() < chegadaApi.getTime()) return chegadaPdf
  const diffMin = Math.abs(chegadaApi.getTime() - chegadaPdf.getTime()) / 60_000
  return diffMin > toleranciaMin ? chegadaApi : chegadaPdf
}
