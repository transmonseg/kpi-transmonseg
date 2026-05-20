import { describe, it, expect } from 'vitest'
import { buildLookupContext } from './lookup-canonical'

describe('buildLookupContext', () => {
  it('lê escala_linhas e lojas e retorna contexto', async () => {
    const svc = mockSupabase({
      escala_linhas: [
        { motorista_nome: 'José Roberto', motorista_codigo: 138, placa_norm: 'DDI6J90', placa_raw: 'DDI-6J90', data_entrega: '2026-05-18', rede_id: 'ASSAI' },
        { motorista_nome: 'José Roberto', motorista_codigo: 138, placa_norm: 'DBB8D19', placa_raw: 'DBB-8D19', data_entrega: '2026-05-17', rede_id: 'ASSAI' },
      ],
      lojas: [
        { rede_id: 'ASSAI', nome: 'ASSAI TIJUCA II', codigo_escala: '150' },
      ],
    })
    const ctx = await buildLookupContext(svc)
    expect(ctx.associacoes).toHaveLength(2)
    expect(ctx.associacoes[0].motorista_nome_norm).toBe('JOSE ROBERTO')
    expect(ctx.lojas).toHaveLength(1)
  })
})

function mockSupabase(tables: Record<string, unknown[]>) {
  return {
    from(tableName: string) {
      const data = tables[tableName] ?? []
      const chain = {
        select: () => chain,
        gte: () => chain,
        eq: () => chain,
        order: () => chain,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
          resolve({ data, error: null }),
      }
      return chain
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}
