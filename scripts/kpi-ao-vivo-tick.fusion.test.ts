import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/kpi-rioquality/fonte-fusion', () => ({ buscarDiaRioQualityFusion: vi.fn() }))
const guardar = vi.fn(async () => {})
vi.mock('../src/lib/kpi-romaneio/ao-vivo-servico', () => ({
  guardarDiaAoVivo: (...a: unknown[]) => (guardar as (...x: unknown[]) => unknown)(...a),
  calcularAoVivo: vi.fn(),
  limparXlsxAoVivo: vi.fn(),
  CLIENTES_AO_VIVO: [],
}))

import { buscarDiaRioQualityFusion } from '../src/lib/kpi-rioquality/fonte-fusion'

describe('sincronizarFusionRioQuality', () => {
  beforeEach(() => guardar.mockClear())

  it('erro na Fusion não derruba o tick', async () => {
    vi.mocked(buscarDiaRioQualityFusion).mockRejectedValue(new Error('timeout'))
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    await expect(sincronizarFusionRioQuality('2026-10-10')).resolves.toBe('erro')
  })

  it('sem dados -> sem_dados e não grava', async () => {
    vi.mocked(buscarDiaRioQualityFusion).mockResolvedValue([])
    const { sincronizarFusionRioQuality } = await import('./kpi-ao-vivo-tick')
    expect(await sincronizarFusionRioQuality('2026-10-10')).toBe('sem_dados')
    expect(guardar).not.toHaveBeenCalled()
  })
})
