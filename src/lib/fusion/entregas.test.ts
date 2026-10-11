// src/lib/fusion/entregas.test.ts
import { describe, it, expect, vi } from 'vitest'
import romaneios from './__fixtures__/romaneios.json'
import entregas from './__fixtures__/entregas.json'

vi.mock('./client', () => ({
  fusionPost: vi.fn(async (path: string) =>
    path.includes('get_grid_romaneios') ? romaneios : entregas),
  fusionGet: vi.fn(),
}))

describe('buscarEntregasDoDia', () => {
  it('casa romaneios com suas entregas', async () => {
    const { buscarEntregasDoDia } = await import('./entregas')
    const r = await buscarEntregasDoDia('2026-10-10')
    expect(r.romaneios).toHaveLength(1)
    expect(r.entregas).toHaveLength(4)
    expect(r.entregas[0].t10_id).toBe('1163924')
  })
})
