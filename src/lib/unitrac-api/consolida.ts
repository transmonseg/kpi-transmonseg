import { apiGet } from './client'
import { haversine } from '@/lib/utils/geo'
import { acharLojaPorCoordenada, type MapaPontos } from './pontos'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

export type StopApiCru = { _data: string; tempoparada: number; latitude: number; longitude: number }

export type BaseCoord = { lat: number; lng: number }
export const BASE_BENASSI: BaseCoord = { lat: -22.8290, lng: -43.3420 }
export const RAIO_BASE_M = 500      // dentro disso da base → classificacao BASE
export const RAIO_CLUSTER_M = 150   // eventos a ≤150m do âncora = mesma permanência
export const MIN_DUR_SEM_GEO_SEG = 300 // cluster sem geofence só vira parada se ≥5min

/** Eventos crus da API, SEM o filtro de 120s (as entregas vêm fragmentadas). */
export async function buscarStopsCru(cv: string, horas: number): Promise<StopApiCru[]> {
  const d = (await apiGet(`/mapa_servicos/stops/${cv}/${horas}`)) as { paradas?: StopApiCru[] } | null
  return (d?.paradas ?? []).filter(p => p.latitude != null && p.longitude != null && Math.abs(p.latitude) > 1)
}

export type Cluster = { eventos: StopApiCru[]; lat: number; lng: number }

/** Agrupa eventos consecutivos (por tempo) que ficam a ≤RAIO_CLUSTER_M do âncora
 *  (1º evento do grupo) numa "permanência" no mesmo local. */
export function clusteriza(eventos: StopApiCru[]): Cluster[] {
  const ord = [...eventos].sort((a, b) => new Date(a._data).getTime() - new Date(b._data).getTime())
  const clusters: Cluster[] = []
  for (const e of ord) {
    const atual = clusters[clusters.length - 1]
    if (atual && haversine(atual.lat, atual.lng, e.latitude, e.longitude) <= RAIO_CLUSTER_M) {
      atual.eventos.push(e)
    } else {
      clusters.push({ eventos: [e], lat: e.latitude, lng: e.longitude })
    }
  }
  return clusters
}
