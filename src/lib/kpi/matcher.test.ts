import { describe, it, expect } from 'vitest'
import { resolveStoreName3Path, type ResolveContext } from './matcher'

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
