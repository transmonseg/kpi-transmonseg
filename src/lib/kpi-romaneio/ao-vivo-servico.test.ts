import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({
  dia: null as Record<string, unknown> | null,
  travaLinhas: [] as unknown[],
  gerou: 0,
  updates: [] as Record<string, unknown>[],
}))

function cadeia(resultado: unknown) {
  const o: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'or', 'update', 'upsert']) o[m] = () => o
  o.maybeSingle = async () => resultado
  o.then = (res: (v: unknown) => void) => res(resultado)
  return o
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (tabela: string) => {
      if (tabela === 'kpi_ao_vivo_dia') return cadeia({ data: c.dia, error: null })
      const o = cadeia({ data: null, error: null }) as Record<string, (...a: unknown[]) => unknown>
      o.update = (v: unknown) => {
        c.updates.push(v as Record<string, unknown>)
        return cadeia({ data: c.travaLinhas, error: null })
      }
      return o
    },
  }),
}))
vi.mock('./gerar-nutrimax', () => ({
  gerarKpiNutrimax: async () => { c.gerou++; throw new Error('nao deveria gerar') },
}))

import { calcularAoVivo } from './ao-vivo-servico'

beforeEach(() => {
  c.dia = { romaneio: [{ nf: '1' }], escala: [], pao: { linhas: [], escala: [] }, escala_enviada: false, pao_enviado: false }
  c.travaLinhas = []
  c.gerou = 0
  c.updates = []
})

describe('calcularAoVivo', () => {
  it('sem romaneio do dia: não calcula', async () => {
    c.dia = null
    expect(await calcularAoVivo('nutrimax', '2026-10-06')).toBe('sem_romaneio')
    expect(c.gerou).toBe(0)
  })
  it('outro cálculo rodando (trava não pega): não calcula', async () => {
    c.travaLinhas = []
    expect(await calcularAoVivo('nutrimax', '2026-10-06')).toBe('ocupado')
    expect(c.gerou).toBe(0)
  })
  it('erro no cálculo: grava o erro e solta a trava', async () => {
    c.travaLinhas = [{ cliente: 'nutrimax' }]
    expect(await calcularAoVivo('nutrimax', '2026-10-06')).toBe('erro')
    expect(c.gerou).toBe(1)
    expect(c.updates.at(-1)).toMatchObject({ ultimo_erro: 'nao deveria gerar', rodando_desde: null })
  })
})
