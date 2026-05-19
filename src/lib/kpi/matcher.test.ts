import { describe, it, expect } from 'vitest'
import { resolveStoreName3Path, type ResolveContext, resolveForaBaseGeo, type GeoStore } from './matcher'

describe('resolveStoreName3Path', () => {
  const ctx: ResolveContext = {
    aliases: {
      'assai': { canonical_nm: 'Assai', canonical_id: 'a1', score: 1.0 }
    },
    trgmResults: {
      'zona sul': { canonical_nm: 'Zona Sul', canonical_id: 'z1', trgm_score: 0.85, match_source: 'canonical' as const }
    }
  }

  it('path 1: alias exato retorna HIGH confidence', () => {
    const r = resolveStoreName3Path('assai', ctx)
    expect(r.confidence).toBe('HIGH')
    expect(r.algorithm).toBe('alias')
    expect(r.requiresReview).toBe(false)
  })

  it('path 2: trgm acima de threshold retorna resultado', () => {
    const r = resolveStoreName3Path('zona sul', ctx)
    expect(r.algorithm).toBe('trgm')
    expect(['HIGH', 'LOW']).toContain(r.confidence)
  })

  it('path 3: nome desconhecido retorna UNMATCHED + requiresReview', () => {
    const r = resolveStoreName3Path('xyzloja', ctx)
    expect(r.confidence).toBe('UNMATCHED')
    expect(r.requiresReview).toBe(true)
    expect(r.algorithm).toBe('none')
  })
})

describe('resolveForaBaseGeo', () => {
  const stores: GeoStore[] = [
    { id: 'a1', name: 'Assai Jacarepagua', lat: -22.9503, lng: -43.3650, raio_metros: 300 }
  ]

  it('retorna match para parada dentro do raio', () => {
    // ~50m from store
    const r = resolveForaBaseGeo(-22.9500, -43.3648, stores)
    expect(r).not.toBeNull()
    expect(r!.name).toBe('Assai Jacarepagua')
  })

  it('retorna null para parada fora do raio', () => {
    // ~5km from store
    const r = resolveForaBaseGeo(-22.9900, -43.4000, stores)
    expect(r).toBeNull()
  })

  it('retorna null quando lojas nao tem lat/lng', () => {
    const noGeo: GeoStore[] = [{ id: 'x', name: 'X', lat: null, lng: null, raio_metros: 300 }]
    expect(resolveForaBaseGeo(-22.9500, -43.3648, noGeo)).toBeNull()
  })
})
