import type { MapaPontos } from './pontos'
import { acharLojaPorCoordenada } from './pontos'
import { haversine } from '@/lib/utils/geo'

export type StopParaConfirmar = {
  id: string
  lat: number | null
  lng: number | null
  chegada: string
  saida: string | null
  classificacao: string
}

export type ConfirmacaoApi = {
  stopId: string
  /** Código da geofence autoritativa da API que contém a parada. */
  codU: string
  nomeApi: string
  distMetros: number
}

/**
 * Confirmação por GABARITO da API: dado o `codigo_unitrac` que a escala espera e
 * as paradas REAIS da placa, acha a parada cuja COORDENADA cai dentro da geofence
 * autoritativa do Unitrac com aquele código. É certeza — a loja é identificada
 * pela geofence que o GPS dispara, não pelo palpite do matcher (nome/código curto,
 * que colide entre lojas homônimas). Match EXATO de código (geofence cod ==
 * codigo_unitrac) de propósito: o objetivo é eliminar ambiguidade, não introduzir.
 * Retorna a 1ª parada (mais cedo) que bate, ou null.
 */
export function confirmaEntregaViaApi(
  esperadaCodU: string | null,
  stops: StopParaConfirmar[],
  pontosApi: MapaPontos,
): ConfirmacaoApi | null {
  if (!esperadaCodU) return null
  const ordenadas = stops
    .filter(s => s.lat != null && s.lng != null &&
      (s.classificacao === 'FORA_BASE' || s.classificacao === 'LOJA'))
    .sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
  for (const s of ordenadas) {
    const p = acharLojaPorCoordenada(s.lat!, s.lng!, pontosApi)
    if (!p || p.cod !== esperadaCodU) continue
    return {
      stopId: s.id,
      codU: p.cod,
      nomeApi: p.nome,
      distMetros: Math.round(haversine(s.lat!, s.lng!, p.lat, p.lon)),
    }
  }
  return null
}
