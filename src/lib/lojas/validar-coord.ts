// #37 — Validação de coordenada ao salvar uma loja.
// Todas as redes atendidas ficam na Região Metropolitana do Rio (Rio, Niterói,
// São Gonçalo, Baixada, Itaguaí, Petrópolis, Cabo Frio/lagos). O erro mais comum
// no cadastro é coordenada TROCADA (lat↔lng) ou digitada errada — que joga a loja
// pro oceano ou outro estado e quebra o resgate geo. Esta checagem barra isso.

/** Caixa que cobre toda a área de operação (com folga). Fora disso = erro de cadastro. */
const LAT_MIN = -23.4, LAT_MAX = -22.0
const LNG_MIN = -44.5, LNG_MAX = -41.8

/**
 * Valida lat/lng de uma loja. Retorna mensagem de erro (string) quando a coord é
 * inválida/suspeita, ou null quando está OK. Ignora null/undefined (coord opcional).
 */
export function validarCoordLoja(lat: unknown, lng: unknown): string | null {
  // Coord opcional: ausência é permitida (loja sem geo ainda casa por código).
  if (lat == null && lng == null) return null
  if (lat == null || lng == null) return 'Informe latitude E longitude (ou deixe as duas em branco).'

  const la = Number(lat), ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return 'Latitude/longitude precisam ser números.'
  if (la === 0 || ln === 0) return 'Coordenada (0,0) é inválida — confira lat/lng.'

  // Troca lat↔lng é o erro clássico: detecta quando, invertendo, a coord passa a
  // cair na área válida (ex.: -43.02,-22.85 deveria ser -22.85,-43.02).
  const dentro = (a: number, n: number) => a >= LAT_MIN && a <= LAT_MAX && n >= LNG_MIN && n <= LNG_MAX
  if (!dentro(la, ln)) {
    if (dentro(ln, la)) return 'Latitude e longitude parecem trocadas — inverta os valores.'
    return `Coordenada (${la}, ${ln}) está fora da região de operação (Grande Rio). Confira lat/lng.`
  }
  return null
}
