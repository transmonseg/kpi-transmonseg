import { describe, it, expect } from 'vitest'
import { clusteriza, type StopApiCru } from './consolida'

describe('clusteriza', () => {
  it('agrupa eventos próximos no espaço e separa os distantes', () => {
    const ev: StopApiCru[] = [
      { _data: '2026-06-12T05:51:00Z', tempoparada: 60, latitude: -22.90316, longitude: -43.11053 },
      { _data: '2026-06-12T05:55:00Z', tempoparada: 60, latitude: -22.90320, longitude: -43.11050 }, // ~5m do 1º
      { _data: '2026-06-12T06:42:00Z', tempoparada: 60, latitude: -22.90721, longitude: -43.10379 }, // ~850m → outro cluster
    ]
    const cl = clusteriza(ev)
    expect(cl).toHaveLength(2)
    expect(cl[0].eventos).toHaveLength(2)
    expect(cl[1].eventos).toHaveLength(1)
  })
})
