import { describe, it, expect, vi, beforeEach } from 'vitest'

// F1-12 (KRQ-09, plano mestre 23/10): erro ao ler kpi_rioquality_frota virava
// Map vazio + log. Sem CV = "sem rastreador" = contada como correta, entao uma
// falha de leitura levava TODAS as NFs da RQ a "SEM RASTREADOR" e a taxa a ~100%.
const r = vi.hoisted(() => ({ resposta: { data: [] as unknown[] | null, error: null as { message: string } | null } }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: () => ({ select: async () => r.resposta }) }),
}))

import { buscarFrotaRioQuality, FrotaRioQualityIndisponivelError } from './frota'

beforeEach(() => { r.resposta = { data: [], error: null } })

describe('buscarFrotaRioQuality (F1-12)', () => {
  it('erro de banco: lanca FrotaRioQualityIndisponivelError (nunca devolve frota vazia)', async () => {
    r.resposta = { data: null, error: { message: 'canceling statement due to statement timeout' } }
    await expect(buscarFrotaRioQuality()).rejects.toBeInstanceOf(FrotaRioQualityIndisponivelError)
  })
  it('tabela sem nenhuma placa: lanca (frota vazia nao e\' "todos sem rastreador")', async () => {
    r.resposta = { data: [], error: null }
    await expect(buscarFrotaRioQuality()).rejects.toThrow(/frota da Rio Quality/i)
  })
  it('frota lida: placa normalizada -> cv', async () => {
    r.resposta = { data: [{ placa_norm: 'RJM-5B51', cv: '15277' }, { placa_norm: 'EEG2F60', cv: 19589 }], error: null }
    const m = await buscarFrotaRioQuality()
    expect([...m]).toEqual([['RJM5B51', '15277'], ['EEG2F60', '19589']])
  })
})
