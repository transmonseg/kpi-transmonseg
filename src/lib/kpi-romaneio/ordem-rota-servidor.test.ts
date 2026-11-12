import { describe, it, expect, vi, beforeEach } from 'vitest'

const est = vi.hoisted(() => ({
  envios: [] as { data: string; nfs: number; placas: number; enviado_por: string; enviado_em: string }[],
  apagou: [] as string[], gravou: [] as { data: string; nf: string; enviado_por: string }[],
  fusion: [] as unknown[], fusionErro: null as string | null, chamadasFusion: 0,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: async () => ({ data: est.envios, error: null }),
    from: () => ({
      delete: () => ({ eq: () => ({ eq: async (_c: string, d: string) => { est.apagou.push(d); return { error: null } } }) }),
      insert: async (rows: { data: string; nf: string; enviado_por: string }[]) => { est.gravou.push(...rows); return { error: null } },
    }),
  }),
}))
vi.mock('@/lib/kpi-rioquality/ordem-rota-fusion', () => ({
  buscarOrdemRotaFusion: async () => { est.chamadasFusion++; if (est.fusionErro) throw new Error(est.fusionErro); return est.fusion },
}))
import { sincronizarOrdemRotaFusion, ENVIADO_FUSION, diasDasLinhas } from './ordem-rota-servidor'

const linha = (nf: string, data: string | null, romaneio = 'R1') => ({ nf, romaneio, placa: 'AAA1A11', ordem: Number(nf), previsaoInicio: null, previsaoFim: null, data })

describe('sincronizarOrdemRotaFusion', () => {
  beforeEach(() => { est.envios = []; est.apagou = []; est.gravou = []; est.fusion = []; est.fusionErro = null; est.chamadasFusion = 0 })
  const agora = Date.parse('2026-11-12T18:00:00Z')

  it('grava tudo no dia pedido, mesmo linha com previsão do dia seguinte (não apaga hoje ao buscar ontem)', async () => {
    est.fusion = [linha('1', '2026-11-11'), linha('2', '2026-11-12', 'R2')]
    const r = await sincronizarOrdemRotaFusion('2026-11-11', { forcar: true, hoje: '2026-11-12' })
    expect(r).toEqual({ situacao: 'ok', nfs: 2 })
    expect(est.apagou).toEqual(['2026-11-11'])
    expect(est.gravou.map(g => [g.data, g.nf, g.enviado_por])).toEqual([['2026-11-11', '1', ENVIADO_FUSION], ['2026-11-11', '2', ENVIADO_FUSION]])
  })
  it('no máximo a cada 30 min (sem forcar)', async () => {
    est.envios = [{ data: '2026-11-12', nfs: 10, placas: 1, enviado_por: ENVIADO_FUSION, enviado_em: '2026-11-12T17:45:00Z' }]
    expect(await sincronizarOrdemRotaFusion('2026-11-12', { agoraMs: agora })).toEqual({ situacao: 'recente' })
    expect(est.chamadasFusion).toBe(0)
    est.envios[0].enviado_em = '2026-11-12T17:20:00Z'
    est.fusion = [linha('1', '2026-11-12')]
    expect((await sincronizarOrdemRotaFusion('2026-11-12', { agoraMs: agora })).situacao).toBe('ok')
  })
  it('Fusion fora ou vazia: não lança e não apaga nada', async () => {
    est.fusionErro = 'ECONNRESET'
    expect(await sincronizarOrdemRotaFusion('2026-11-12', { forcar: true })).toEqual({ situacao: 'erro', erro: 'ECONNRESET' })
    est.fusionErro = null
    expect(await sincronizarOrdemRotaFusion('2026-11-12', { forcar: true })).toEqual({ situacao: 'sem_dados' })
    expect(est.apagou).toEqual([])
  })
})

describe('diasDasLinhas (upload de relatório com vários dias)', () => {
  it('cada viagem no dia mais comum das previsões dela; futuro e sem data ficam no dia do envio', () => {
    const ls = [linha('1', '2026-11-11', 'A'), linha('2', '2026-11-12', 'A'), linha('3', '2026-11-11', 'A'), linha('4', '2026-11-13', 'B'), linha('5', null, 'C')]
    const d = diasDasLinhas(ls, '2026-11-12', '2026-11-12')
    expect(ls.map(l => d.get(l))).toEqual(['2026-11-11', '2026-11-11', '2026-11-11', '2026-11-12', '2026-11-12'])
  })
})
