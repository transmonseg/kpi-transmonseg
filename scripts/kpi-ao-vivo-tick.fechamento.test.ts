import { describe, it, expect, vi } from 'vitest'

// RQ-09 (auditoria 20/10): o fechamento das 00:30 recalculava a RQ com o
// ultimo romaneio sincronizado (a sync para as 21h e falha com o tunel caido):
// em 20/10 a Fusion tinha 94 romaneios e o KPI gravou 88.
const ordem = vi.hoisted(() => [] as string[])
vi.mock('../src/lib/supabase/service', () => ({
  createServiceClient: () => {
    const o: Record<string, unknown> = {}
    for (const m of ['from', 'select', 'eq']) o[m] = () => o
    o.maybeSingle = async () => ({ data: { calculado_em: '2026-10-20T23:00:00Z' }, error: null })
    return o
  },
}))
const fusion = vi.hoisted(() => ({ falha: false }))
vi.mock('../src/lib/kpi-rioquality/fonte-fusion', () => ({ buscarDiaRioQualityFusion: vi.fn(async (d: string) => { ordem.push(`fusion ${d}`); if (fusion.falha) throw new Error('fetch failed'); return [] }) }))
vi.mock('../src/lib/kpi-romaneio/ao-vivo-servico', () => ({
  CLIENTES_AO_VIVO: ['rioquality'],
  calcularAoVivo: vi.fn(async (c: string, d: string) => { ordem.push(`calculo ${c} ${d}`); return 'ok' }),
  guardarDiaAoVivo: vi.fn(),
  fonteDoDiaAoVivo: vi.fn(async () => 'fusion'),
  limparXlsxAoVivo: vi.fn(),
}))

describe('fecharDiaAnterior', () => {
  it('rioquality: sincroniza a Fusion de ontem antes do calculo final', async () => {
    vi.setSystemTime(new Date('2026-10-21T04:00:00Z')) // 01:00 BRT
    const { fecharDiaAnterior } = await import('./kpi-ao-vivo-tick')
    await fecharDiaAnterior()
    expect(ordem).toEqual(['fusion 2026-10-20', 'calculo rioquality 2026-10-20'])
    vi.useRealTimers()
  })
  // Revisao final 23/10: com o tunel caido, o fechamento gravava calculado_em
  // e o dia nunca mais era refeito com o romaneio completo.
  it('rioquality: Fusion fora de madrugada -> nao fecha (o proximo tick tenta de novo)', async () => {
    ordem.length = 0; fusion.falha = true
    vi.setSystemTime(new Date('2026-10-21T04:00:00Z')) // 01:00 BRT
    const { fecharDiaAnterior } = await import('./kpi-ao-vivo-tick')
    await fecharDiaAnterior()
    expect(ordem).toEqual(['fusion 2026-10-20'])
    vi.useRealTimers()
  })
  it('rioquality: Fusion ainda fora as 06h -> fecha com o que tem', async () => {
    ordem.length = 0; fusion.falha = true
    vi.setSystemTime(new Date('2026-10-21T09:10:00Z')) // 06:10 BRT
    const { fecharDiaAnterior } = await import('./kpi-ao-vivo-tick')
    await fecharDiaAnterior()
    expect(ordem).toEqual(['fusion 2026-10-20', 'calculo rioquality 2026-10-20'])
    vi.useRealTimers()
  })
})
