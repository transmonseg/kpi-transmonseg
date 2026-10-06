import { describe, it, expect } from 'vitest'
import { validadeCacheMs, cacheFresco } from './cache-dia'

describe('cache do dia', () => {
  it('hoje: 4 min (o dia ainda está acontecendo); dia passado: 6 h', () => {
    expect(validadeCacheMs('2026-10-06', '2026-10-06')).toBe(4 * 60_000)
    expect(validadeCacheMs('2026-10-05', '2026-10-06')).toBe(6 * 3600_000)
  })
  it('fresco só dentro da validade', () => {
    const agora = Date.parse('2026-10-06T12:00:00Z')
    expect(cacheFresco('2026-10-06T11:57:00Z', '2026-10-06', '2026-10-06', agora)).toBe(true)
    expect(cacheFresco('2026-10-06T11:55:00Z', '2026-10-06', '2026-10-06', agora)).toBe(false)
    expect(cacheFresco('2026-10-06T07:00:00Z', '2026-10-05', '2026-10-06', agora)).toBe(true)
    expect(cacheFresco(null, '2026-10-05', '2026-10-06', agora)).toBe(false)
  })
})
