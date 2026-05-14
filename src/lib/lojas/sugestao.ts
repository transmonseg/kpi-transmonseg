import { normalizaNome, levenshtein } from '@/lib/utils/texto'
import { haversine } from '@/lib/utils/geo'
import type { LojaRow } from './catalogo'

export type SugestaoLoja = {
  loja: LojaRow
  score: number
  motivo: 'codigo' | 'nome' | 'geo' | 'nome+geo'
  distancia_metros: number | null
  distancia_nome: number
}

function scoreNome(dist: number): number {
  if (dist === 0) return 0.95
  if (dist === 1) return 0.85
  if (dist === 2) return 0.70
  return 0
}

function scoreGeo(metros: number): number {
  if (metros <= 100) return 0.90
  if (metros <= 200) return 0.75
  if (metros <= 500) return 0.60
  return 0
}

export function sugereLoja(params: {
  codigo_unitrac: string | null
  nome_unitrac: string | null
  lat: number | null
  lng: number | null
  rede_id_sugerida: string | null
  lojas: LojaRow[]
  limit?: number
}): SugestaoLoja[] {
  const { codigo_unitrac, nome_unitrac, lat, lng, rede_id_sugerida, lojas, limit = 5 } = params

  const normQuery = nome_unitrac ? normalizaNome(nome_unitrac) : null
  const codNorm = codigo_unitrac ? codigo_unitrac.trim().toUpperCase() : null

  const candidatos: SugestaoLoja[] = []

  for (const loja of lojas) {
    if (!loja.ativo) continue
    if (rede_id_sugerida && loja.rede_id !== rede_id_sugerida) continue

    if (codNorm && loja.codigo_unitrac?.toUpperCase() === codNorm) {
      candidatos.push({
        loja,
        score: 1.0,
        motivo: 'codigo',
        distancia_metros: lat !== null && lng !== null && loja.lat !== null && loja.lng !== null
          ? haversine(lat, lng, loja.lat, loja.lng)
          : null,
        distancia_nome: normQuery ? levenshtein(normQuery, loja.nome_normalizado) : 0,
      })
      continue
    }

    const nomeDist = normQuery ? levenshtein(normQuery, loja.nome_normalizado) : Infinity
    const snome = nomeDist <= 2 ? scoreNome(nomeDist) : 0

    const metros = lat !== null && lng !== null && loja.lat !== null && loja.lng !== null
      ? haversine(lat, lng, loja.lat, loja.lng)
      : null
    const sgeo = metros !== null && metros <= 500 ? scoreGeo(metros) : 0

    if (snome === 0 && sgeo === 0) continue

    let score: number
    let motivo: SugestaoLoja['motivo']

    if (snome > 0 && sgeo > 0) {
      score = Math.max(snome, sgeo) + 0.05
      motivo = 'nome+geo'
    } else if (snome > 0) {
      score = snome
      motivo = 'nome'
    } else {
      score = sgeo
      motivo = 'geo'
    }

    candidatos.push({
      loja,
      score: Math.min(score, 1.0),
      motivo,
      distancia_metros: metros,
      distancia_nome: nomeDist === Infinity ? levenshtein('', loja.nome_normalizado) : nomeDist,
    })
  }

  return candidatos
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
