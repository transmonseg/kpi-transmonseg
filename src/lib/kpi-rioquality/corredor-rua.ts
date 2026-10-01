import { haversine } from '@/lib/utils/geo'
import type { PontoZona } from './geocode-coerencia'
import { RAIO_MAX_CORREDOR_M, RAIO_ANCORAGEM_CORREDOR_M } from './constants'

// Corredor da rua pra endereco SEM NUMERO (formatos da RQ com cidade). Os
// pontos vem da ponte de coerencia do monitoramento (pontosZona: aglomerados
// CNEFE da mesma rua normalizada, com municipio IBGE) -- nenhum endpoint novo.
// O municipio do endereco e' o do ponto da rua mais perto da coordenada que a
// cascata (com guarda territorial) achou; so' entram pontos desse municipio
// a ate' RAIO_MAX_CORREDOR_M. Ver constants.ts.

/** Pontos da mesma rua + municipio do endereco. [] quando a coordenada nao
 *  esta' perto de nenhum ponto da rua (geocode de outra rua/municipio). */
export function montarCorredorDaRua(ponto: { lat: number; lng: number }, pontosRua: PontoZona[]): PontoZona[] {
  let ancora: PontoZona | null = null
  let melhor = Infinity
  for (const p of pontosRua) {
    const d = haversine(ponto.lat, ponto.lng, p.lat, p.lng)
    if (d < melhor) { melhor = d; ancora = p }
  }
  if (!ancora || melhor > RAIO_ANCORAGEM_CORREDOR_M) return []
  const municipio = ancora.municipioCodigo ?? null
  return pontosRua.filter(p =>
    (municipio == null || p.municipioCodigo === municipio)
    && haversine(ponto.lat, ponto.lng, p.lat, p.lng) <= RAIO_MAX_CORREDOR_M)
}

/** Maior distancia (m) entre dois pontos do corredor. */
export function extensaoCorredorM(pontos: { lat: number; lng: number }[]): number {
  let max = 0
  for (let i = 0; i < pontos.length; i++) {
    for (let j = i + 1; j < pontos.length; j++) {
      max = Math.max(max, haversine(pontos[i].lat, pontos[i].lng, pontos[j].lat, pontos[j].lng))
    }
  }
  return max
}
