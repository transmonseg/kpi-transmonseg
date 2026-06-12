import type { VeiculoApi } from './frota'
import { normPlaca } from './frota'
import { acharLojaPorCoordenada, type MapaPontos } from './pontos'
import type { MapaPosicoes } from './posicoes'

export * from './frota'
export * from './pontos'
export * from './paradas'
export * from './posicoes'
export * from './confirma'
export * from './consolida'

export type CorrecaoPlaca = { placa: string; cv: string; origem: 'api' }
export type CorrecaoLoja = { codigoUnitrac: string; nome: string; lat: number; lon: number; origem: 'api' }
export type ValidacaoRota = { aindaRodando: boolean; origem: 'api' }

/** Completa uma placa parcial/ocr-suja pelo sufixo, só se houver match único. */
export function corrigirPlaca(parcial: string, frota: VeiculoApi[]): CorrecaoPlaca | null {
  const alvo = normPlaca(parcial)
  if (alvo.length < 4) return null
  const hits = frota.filter(v => v.placaNorm === alvo || v.placaNorm.endsWith(alvo))
  if (hits.length !== 1) return null
  return { placa: hits[0].placa, cv: hits[0].cv, origem: 'api' }
}

export function corrigirLoja(lat: number, lon: number, pontos: MapaPontos): CorrecaoLoja | null {
  const p = acharLojaPorCoordenada(lat, lon, pontos)
  if (!p) return null
  return { codigoUnitrac: p.cod, nome: p.nome, lat: p.lat, lon: p.lon, origem: 'api' }
}

export function validarRotaConcluida(placa: string, posicoes: MapaPosicoes): ValidacaoRota | null {
  const p = posicoes[normPlaca(placa)]
  if (!p) return null
  if (p.velocidade > 1 && p.ignicao) return { aindaRodando: true, origem: 'api' }
  return null
}
