import { normalizaNome, levenshtein } from '@/lib/utils/texto'
import { haversine } from '@/lib/utils/geo'

export type LojaRow = {
  id: string
  rede_id: string
  nome: string
  nome_normalizado: string
  codigo_escala: string | null
  codigo_unitrac: string | null
  nome_unitrac: string | null
  lat: number | null
  lng: number | null
  raio_metros: number
  endereco?: string | null
  bairro?: string | null
  municipio?: string | null
  ativo: boolean
}

export function buscaPorCodigoUnitrac(codigo: string, lojas: LojaRow[]): LojaRow | null {
  const norm = codigo.trim().toUpperCase()
  return lojas.find(l => l.ativo && l.codigo_unitrac?.toUpperCase() === norm) ?? null
}

export function buscaPorCodigoEscala(rede_id: string, codigo: string, lojas: LojaRow[]): LojaRow | null {
  const norm = codigo.trim().toUpperCase()
  return lojas.find(l => l.ativo && l.rede_id === rede_id && l.codigo_escala?.toUpperCase() === norm) ?? null
}

export function buscaPorNome(rede_id: string, nomeRaw: string, lojas: LojaRow[]): LojaRow | null {
  const normQuery = normalizaNome(nomeRaw)
  if (!normQuery) return null

  let best: LojaRow | null = null
  let bestDist = Infinity

  for (const l of lojas) {
    if (!l.ativo || l.rede_id !== rede_id) continue
    const dist = levenshtein(normQuery, l.nome_normalizado)
    if (dist <= 2 && dist < bestDist) {
      bestDist = dist
      best = l
    }
  }

  return best
}

export function buscaPorProximidade(
  lat: number,
  lng: number,
  lojas: LojaRow[],
  raioMaxMetros?: number,
): LojaRow | null {
  let best: LojaRow | null = null
  let bestDist = Infinity

  for (const l of lojas) {
    if (!l.ativo || l.lat === null || l.lng === null) continue
    const dist = haversine(lat, lng, l.lat, l.lng)
    const limite = raioMaxMetros !== undefined ? Math.min(raioMaxMetros, l.raio_metros) : l.raio_metros
    if (dist <= limite && dist < bestDist) {
      bestDist = dist
      best = l
    }
  }

  return best
}

export function resolveParada(params: {
  codigo_unitrac?: string | null
  nome_raw?: string | null
  lat?: number | null
  lng?: number | null
  rede_id: string
  lojas: LojaRow[]
}): { loja: LojaRow | null; estrategia: 'codigo' | 'nome' | 'geo' | null } {
  const { codigo_unitrac, nome_raw, lat, lng, rede_id, lojas } = params

  if (codigo_unitrac) {
    const loja = buscaPorCodigoUnitrac(codigo_unitrac, lojas)
    if (loja) return { loja, estrategia: 'codigo' }
  }

  if (nome_raw) {
    const loja = buscaPorNome(rede_id, nome_raw, lojas)
    if (loja) return { loja, estrategia: 'nome' }
  }

  if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
    const loja = buscaPorProximidade(lat, lng, lojas)
    if (loja) return { loja, estrategia: 'geo' }
  }

  return { loja: null, estrategia: null }
}
