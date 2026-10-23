import { describe, it, expect, vi } from 'vitest'

// RQ-09 (auditoria 20/10): o fechamento das 00:30 recalculava a RQ com o
// ultimo romaneio sincronizado (a sync para as 21h e falha com o tunel caido):
// em 20/10 a Fusion tinha 94 romaneios e o KPI gravou 88.
const ordem = vi.hoisted(() => [] as string[])
const linhaCalculo = vi.hoisted(() => ({ valor: { calculado_em: '2026-10-20T23:00:00Z' } as Record<string, string | null> }))
vi.mock('../src/lib/supabase/service', () => ({
  createServiceClient: () => {
    const o: Record<string, unknown> = {}
    for (const m of ['from', 'select', 'eq']) o[m] = () => o
    o.maybeSingle = async () => ({ data: linhaCalculo.valor, error: null })
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

// F1-11 (KN-08): fechamento de 22/10 (00:30) sem a conferencia de territorio.
// O tick repete o calculo do dia fechado a partir das 05:30 BRT, uma vez.
describe('reconferirTerritorioDiaAnterior (F1-11)', () => {
  const fechado = '2026-10-23T03:31:10.000Z' // 00:31 BRT
  it('05:40 BRT com o aviso do fechamento: refaz o calculo do dia anterior', async () => {
    ordem.length = 0
    const { AVISO_TERRITORIO_AO_VIVO } = await import('../src/lib/kpi-romaneio/ao-vivo')
    linhaCalculo.valor = { calculado_em: fechado, ultimo_erro: `${AVISO_TERRITORIO_AO_VIVO} no fechamento`, ultimo_erro_em: fechado }
    vi.setSystemTime(new Date('2026-10-23T08:40:00Z'))
    const { reconferirTerritorioDiaAnterior } = await import('./kpi-ao-vivo-tick')
    await reconferirTerritorioDiaAnterior()
    expect(ordem).toEqual(['calculo rioquality 2026-10-22'])
    vi.useRealTimers()
  })
  it('04:50 BRT: ainda nao', async () => {
    ordem.length = 0
    const { AVISO_TERRITORIO_AO_VIVO } = await import('../src/lib/kpi-romaneio/ao-vivo')
    linhaCalculo.valor = { calculado_em: fechado, ultimo_erro: `${AVISO_TERRITORIO_AO_VIVO} no fechamento`, ultimo_erro_em: fechado }
    vi.setSystemTime(new Date('2026-10-23T07:50:00Z'))
    const { reconferirTerritorioDiaAnterior } = await import('./kpi-ao-vivo-tick')
    await reconferirTerritorioDiaAnterior()
    expect(ordem).toEqual([])
    vi.useRealTimers()
  })
})

