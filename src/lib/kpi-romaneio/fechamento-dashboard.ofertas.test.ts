import { describe, it, expect, vi } from 'vitest'

// F3-01: a oferta so' aparece quando a planilha do fechamento ainda existe
// (a seco 24/10: RQ 13/10 e Nutry 06/10 sem planilha -> "Trocar" falharia).
const c = vi.hoisted(() => ({ pastas: {} as Record<string, string[]>, listaFalha: false }))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      const o: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'gte', 'lte', 'order']) o[m] = () => o
      o.then = (res: (v: unknown) => void) => res({
        data: [
          { data: '2026-10-13', calculado_em: '2026-10-14T03:30:49Z', resumo: { taxa: 86.2, entregues: 1745, nfsNaConta: 2024, aguardando: 0 }, degradado: null },
          { data: '2026-10-22', calculado_em: '2026-10-23T03:31:15Z', resumo: { taxa: 91.4, entregues: 2633, nfsNaConta: 2881, aguardando: 0 }, degradado: null },
        ], error: null,
      })
      return o
    },
    storage: {
      from: () => ({
        list: async (pasta: string) => (c.listaFalha ? { data: null, error: { message: 'x' } } : { data: (c.pastas[pasta] ?? []).map(name => ({ name })), error: null }),
      }),
    },
  }),
}))

import { ofertasDoPeriodo } from './fechamento-dashboard'

describe('F3-01: ofertas só com a planilha do fechamento guardada', () => {
  it('RQ 13/10 sem planilha fica fora; 22/10 (em ao-vivo/) entra', async () => {
    c.pastas = { 'ao-vivo/rioquality': ['2026-10-22.xlsx'], 'fechados/rioquality': [] }
    const o = await ofertasDoPeriodo('rioquality', [], '2026-10-01', '2026-10-31')
    expect(o.map(x => x.data)).toEqual(['2026-10-22'])
  })
  it('sem conseguir listar o Storage: mostra todas (a troca explica se faltar)', async () => {
    c.listaFalha = true
    const o = await ofertasDoPeriodo('rioquality', [], '2026-10-01', '2026-10-31')
    expect(o.map(x => x.data)).toEqual(['2026-10-13', '2026-10-22'])
    c.listaFalha = false
  })
  it('Porte Frio (sem Ao vivo): nenhuma oferta', async () => {
    expect(await ofertasDoPeriodo('portefrio', [], '2026-10-01', '2026-10-31')).toEqual([])
  })
})
