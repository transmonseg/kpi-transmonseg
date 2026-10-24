import { describe, it, expect, vi, beforeEach } from 'vitest'

// F3-R06: a trava do motivo não pode abrir calada quando o banco falha. Erro ao
// ler as gerações ou o fechamento = na dúvida, exige motivo (fail-closed).

const st = vi.hoisted(() => ({
  fechamentos: [] as unknown[],
  erroFechamento: null as Error | null,
  geracoes: [] as unknown[],
  erroGeracoes: null as { message: string } | null,
}))

vi.mock('./fechamento-dashboard', async (orig) => ({
  ...(await orig<typeof import('./fechamento-dashboard')>()),
  listarFechamentosDasDatas: async () => { if (st.erroFechamento) throw st.erroFechamento; return st.fechamentos },
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: st.erroGeracoes ? null : st.geracoes, error: st.erroGeracoes }).then(ok) }
      return q
    },
  }),
}))

import { diaJaFechado } from './versao-oficial'

beforeEach(() => {
  st.fechamentos = []; st.erroFechamento = null; st.geracoes = []; st.erroGeracoes = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('diaJaFechado (F3-R06)', () => {
  it('22/10 sem fechamento e sem geração completa: aberto', async () => {
    expect((await diaJaFechado('nutrimax', '2026-10-22', '2026-10-24')).fechado).toBe(false)
  })
  it('22/10 com geração completa visível: fechado', async () => {
    st.geracoes = [{ resumo: { taxa: 96.9, entregues: 2183, nfsNaConta: 2253, aguardando: 0 } }]
    expect((await diaJaFechado('nutrimax', '2026-10-22', '2026-10-24')).fechado).toBe(true)
  })
  it('timeout do PostgREST em kpi_romaneio_geracoes: exige motivo e avisa a falha', async () => {
    st.erroGeracoes = { message: 'canceling statement due to statement timeout' }
    const r = await diaJaFechado('nutrimax', '2026-10-22', '2026-10-24')
    expect(r.fechado).toBe(true)
    expect(r.falhaLeitura).toBe(true)
    expect(console.error).toHaveBeenCalled()
  })
  it('erro ao ler o fechamento em kpi_ao_vivo_calculo: exige motivo', async () => {
    st.erroFechamento = new Error('fechamentos nutrimax: fetch failed')
    const r = await diaJaFechado('nutrimax', '2026-10-22', '2026-10-24')
    expect(r.fechado).toBe(true)
    expect(r.falhaLeitura).toBe(true)
  })
  it('dia de hoje nunca exige motivo, nem lê o banco', async () => {
    st.erroGeracoes = { message: 'x' }
    expect((await diaJaFechado('nutrimax', '2026-10-24', '2026-10-24')).fechado).toBe(false)
  })
})
