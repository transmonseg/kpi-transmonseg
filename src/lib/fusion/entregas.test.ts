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

// Revisao Fase 2 (F2-REV-02): JSON 200 sem `rows` passava como romaneio vazio
// (`g.rows ?? []`) e o romaneio sumia do dia em silencio.
describe('resposta da Fusion sem rows (F2-REV-02)', () => {
  it('romaneio sem rows lanca erro (nao vira romaneio vazio)', async () => {
    const { fusionPost } = await import('./client')
    vi.mocked(fusionPost).mockResolvedValueOnce({ total: 40 } as never)
    const { buscarEntregasDoRomaneio } = await import('./entregas')
    await expect(buscarEntregasDoRomaneio('1167566')).rejects.toThrow(/sem rows/)
  })

  it('lista de romaneios sem rows tambem lanca', async () => {
    const { fusionPost } = await import('./client')
    vi.mocked(fusionPost).mockResolvedValueOnce({ erro: 'x' } as never)
    const { buscarRomaneiosDoDia } = await import('./entregas')
    await expect(buscarRomaneiosDoDia('2026-10-20')).rejects.toThrow(/sem rows/)
  })

  it('rows vazio com total 0 continua valendo (dia sem romaneio)', async () => {
    const { fusionPost } = await import('./client')
    vi.mocked(fusionPost).mockResolvedValueOnce({ total: 0, rows: [] } as never)
    const { buscarRomaneiosDoDia } = await import('./entregas')
    await expect(buscarRomaneiosDoDia('2026-10-25')).resolves.toEqual([])
  })
})
