import { haversine } from '@/lib/utils/geo'

/**
 * Match de parada FORA_BASE (sem código) a uma loja cadastrada, por COORDENADA,
 * com o endereço/bairro como confirmação anti-falso-positivo.
 *
 * Contexto: o Unitrac marca FORA_BASE quando o GPS caiu fora do geofence
 * cadastrado, mas o caminhão pode estar na rua da loja (parou na lateral, ou o
 * raio do geofence é pequeno). Validação em dados reais (relatório dia 20, 554
 * paradas FORA_BASE) mostrou que casar por RUA-texto falha (2/554, ruas
 * ambíguas tipo "Av. das Américas" = 17 lojas), mas COORDENADA casa limpo:
 * abismo natural em ~150m separa loja real (≤150m) de ruído (>500m).
 *
 * Regra (decisão fundador 2026-06-01):
 *  - só FORA_BASE sem codigo_loja e com lat/lng;
 *  - acha a loja mais próxima por haversine;
 *  - dist ≤ hardMetros (100): casa direto ('coord');
 *  - hardMetros < dist ≤ confirmMetros (250): casa só se a rua OU bairro do
 *    cadastro aparecer no endereço da parada ('coord+rua');
 *  - senão: não casa.
 */

export type LojaGeo = {
  id: string
  rede_id: string
  nome: string
  lat: number | null
  lng: number | null
  endereco?: string | null
  bairro?: string | null
  municipio?: string | null
  numero?: string | null
}

export type ParadaGeo = {
  lat: number | null
  lng: number | null
  endereco: string | null
  classificacao: string
  codigo_loja: string | null
}

export type GeoMatch = { loja: LojaGeo; via: 'coord' | 'coord+rua'; distancia: number }

export const DEFAULT_HARD_METROS = 100
export const DEFAULT_CONFIRM_METROS = 250

const VIA_PREFIX = new Set([
  'RUA', 'R', 'AV', 'AVENIDA', 'ESTR', 'ESTRADA', 'ROD', 'RODOVIA',
  'TRAV', 'TRAVESSA', 'PRACA', 'PCA', 'ALAMEDA', 'AL', 'LARGO', 'VIA', 'CAMINHO',
])

/** Normaliza logradouro: upper, sem acento, sem pontuação/números, sem prefixo de via. */
export function normRua(s: string | null | undefined): string {
  if (!s) return ''
  const limpo = String(s)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\d+/g, ' ')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const tokens = limpo.split(' ')
  if (tokens.length > 1 && VIA_PREFIX.has(tokens[0])) tokens.shift()
  return tokens.join(' ').trim()
}

/**
 * Confirmação REFORÇADA (faixa 100–250m): a RUA do cadastro tem que aparecer no
 * endereço da parada E pelo menos mais um sinal de localidade (bairro, município
 * ou número). Rua sozinha não basta — evita casar "Av. das Américas" genérica.
 * Número entra best-effort (o cadastro Unitrac costuma ter "0"/vazio).
 */
function enderecoConfirma(loja: LojaGeo, paradaEndereco: string | null): boolean {
  const endParada = normRua(paradaEndereco)
  if (!endParada) return false
  const endParadaRaw = String(paradaEndereco).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const ruaCad = normRua(loja.endereco)
  if (!ruaCad || ruaCad.length < 4 || !endParada.includes(ruaCad)) return false // rua é obrigatória

  const bairroCad = normRua(loja.bairro)
  if (bairroCad && bairroCad.length >= 4 && endParada.includes(bairroCad)) return true
  const munCad = normRua(loja.municipio)
  if (munCad && munCad.length >= 4 && endParada.includes(munCad)) return true
  const num = loja.numero
  if (num && num !== '0' && /^\d+$/.test(num) && new RegExp(`\\b${num}\\b`).test(endParadaRaw)) return true
  return false
}

export function matchGeoEndereco(
  parada: ParadaGeo,
  lojasRede: LojaGeo[],
  opts?: { hardMetros?: number; confirmMetros?: number },
): GeoMatch | null {
  if (parada.classificacao !== 'FORA_BASE') return null
  if (parada.codigo_loja) return null
  if (parada.lat == null || parada.lng == null) return null

  const hard = opts?.hardMetros ?? DEFAULT_HARD_METROS
  const confirm = opts?.confirmMetros ?? DEFAULT_CONFIRM_METROS

  let best: LojaGeo | null = null
  let bestDist = Infinity
  for (const l of lojasRede) {
    if (l.lat == null || l.lng == null) continue
    const d = haversine(parada.lat, parada.lng, l.lat, l.lng)
    if (d < bestDist) { bestDist = d; best = l }
  }
  if (!best) return null

  if (bestDist <= hard) return { loja: best, via: 'coord', distancia: bestDist }
  if (bestDist <= confirm && enderecoConfirma(best, parada.endereco)) {
    return { loja: best, via: 'coord+rua', distancia: bestDist }
  }
  return null
}
