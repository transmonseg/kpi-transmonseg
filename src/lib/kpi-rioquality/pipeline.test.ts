import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/unitrac-api', () => ({
  normPlaca: (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, ''),
  buscarStopsCru: vi.fn(),
  consolidaParadasApi: vi.fn(),
}))
vi.mock('@/lib/kpi-romaneio/base-horarios', () => ({
  buscarHorariosBase: vi.fn(),
}))

import { buscarStopsCru, consolidaParadasApi } from '@/lib/unitrac-api'
import { buscarHorariosBase } from '@/lib/kpi-romaneio/base-horarios'
import { buscarParadasPadraoRioQuality } from './pipeline'

describe('buscarParadasPadraoRioQuality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MOTOR_SECRET = 'x'
  })

  it('sem apagao: prefere a parada da ponte', async () => {
    const daPonte = [
      { chegada: '2026-09-11T10:00:00.000Z', saida: '2026-09-11T10:20:00.000Z', duracaoSeg: 1200, lat: -22.9, lng: -43.2, classificacao: 'FORA_BASE' as const },
    ]
    vi.mocked(buscarHorariosBase).mockResolvedValue(new Map([
      ['RQU2G47', { saidaBase: null, chegadaBase: null, kmPercorrido: null, paradas: daPonte, apagaoDeSinal: false }],
    ]))
    vi.mocked(buscarStopsCru).mockResolvedValue([])
    vi.mocked(consolidaParadasApi).mockReturnValue([{ id: 'da-unitrac' }] as never)

    const r = await buscarParadasPadraoRioQuality('12345', 'RQU2G47', '2026-09-11')
    expect(r).toHaveLength(1)
    expect((r[0] as unknown as { id: string }).id).not.toBe('da-unitrac')
  })

  it('com apagao: cai pra Unitrac mesmo com a ponte tendo parada', async () => {
    const daPonte = [
      { chegada: '2026-09-11T10:00:00.000Z', saida: '2026-09-11T10:20:00.000Z', duracaoSeg: 1200, lat: -22.9, lng: -43.2, classificacao: 'FORA_BASE' as const },
    ]
    vi.mocked(buscarHorariosBase).mockResolvedValue(new Map([
      ['RQU2G47', { saidaBase: null, chegadaBase: null, kmPercorrido: null, paradas: daPonte, apagaoDeSinal: true }],
    ]))
    vi.mocked(buscarStopsCru).mockResolvedValue([])
    const daUnitrac = [{ id: 'da-unitrac' }]
    vi.mocked(consolidaParadasApi).mockReturnValue(daUnitrac as never)

    const r = await buscarParadasPadraoRioQuality('12345', 'RQU2G47', '2026-09-11')
    expect(r).toBe(daUnitrac)
  })

  it('sem dado na ponte: cai pra Unitrac (fail-open)', async () => {
    vi.mocked(buscarHorariosBase).mockResolvedValue(new Map())
    vi.mocked(buscarStopsCru).mockResolvedValue([])
    const daUnitrac = [{ id: 'da-unitrac' }]
    vi.mocked(consolidaParadasApi).mockReturnValue(daUnitrac as never)

    const r = await buscarParadasPadraoRioQuality('12345', 'RQU2G47', '2026-09-11')
    expect(r).toBe(daUnitrac)
  })
})
