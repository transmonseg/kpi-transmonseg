import { describe, it, expect } from 'vitest'
import { validadeCacheMs, cacheFresco, chaveCacheDia, chaveLida } from './cache-dia'

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

// KPI-08 (auditoria 03/11): a chave das paradas não tinha a data (o dia
// seguinte sobrescrevia) e o fechamento das 00:30 usava a leitura das ~20:50.
describe('cache do dia com a data na chave e fechamento sem cache da véspera', () => {
  it('a chave gravada tem a data; a leitura aceita a nova e a antiga', () => {
    expect(chaveCacheDia('paradas', '2026-10-30', '123|RBG4F53')).toBe('paradas:2026-10-30:123|RBG4F53')
    expect(chaveLida('paradas:2026-10-30:123|RBG4F53', 'paradas', '2026-10-30')).toBe('123|RBG4F53')
    expect(chaveLida('paradas:123|RBG4F53', 'paradas', '2026-10-30')).toBe('123|RBG4F53')
  })
  it('dia passado: cache gravado antes do fim do dia (20:50 BRT) não vale no fechamento das 00:30', () => {
    const fechamento = Date.parse('2026-10-31T03:30:00Z') // 00:30 BRT de 31/10
    expect(cacheFresco('2026-10-30T23:50:00Z', '2026-10-30', '2026-10-31', fechamento)).toBe(false) // 20:50 BRT
    expect(cacheFresco('2026-10-31T03:05:00Z', '2026-10-30', '2026-10-31', fechamento)).toBe(true) // 00:05 BRT
  })
})
