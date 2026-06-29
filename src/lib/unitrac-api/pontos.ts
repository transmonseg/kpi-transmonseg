import { apiPost } from './client'

export type PontoApi = { nome: string; lat: number; lon: number; raio: number; cod: string }
export type MapaPontos = Record<string, PontoApi>

function distMetros(la: number, lo: number, lb: number, lob: number): number {
  return Math.sqrt((la - lb) ** 2 + (lo - lob) ** 2) * 111000
}

export async function buscarPontos(cvs: string[]): Promise<MapaPontos> {
  const d = (await apiPost('/mapa_servicos/alvos', cvs)) as {
    alvos?: Array<{ pontoidentificador: string; pontonome: string; pontolatitude: number; pontolongitude: number; pontoraio: number }>
  } | null
  const mapa: MapaPontos = {}
  for (const a of d?.alvos ?? []) {
    const id = String(a.pontoidentificador)
    if (!id || Math.abs(a.pontolatitude) < 1) continue
    mapa[id] = { nome: a.pontonome, lat: a.pontolatitude, lon: a.pontolongitude, raio: a.pontoraio, cod: id }
  }
  return mapa
}

// Raio mínimo garantido: o Unitrac cadastra alguns pontos com raio muito pequeno
// (ex: 100m) enquanto a entrega real pode ocorrer a 150m do centro do geofence.
// 150m é o padrão do sistema; raios menores da API são expandidos até esse mínimo.
const RAIO_MIN_M = 150

export function acharLojaPorCoordenada(lat: number, lon: number, pontos: MapaPontos): PontoApi | null {
  let melhor: PontoApi | null = null
  let melhorDist = Infinity
  for (const p of Object.values(pontos)) {
    const d = distMetros(lat, lon, p.lat, p.lon)
    const raioEfetivo = Math.max(p.raio, RAIO_MIN_M)
    if (d <= raioEfetivo + 30 && d < melhorDist) {
      melhor = p
      melhorDist = d
    }
  }
  return melhor
}
