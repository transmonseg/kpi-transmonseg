import { describe, it, expect, vi, beforeEach } from 'vitest'

// RQ-08 (auditoria 20/10): a ponte de coerencia do monitoramento respondendo
// 500 derrubava 80-100 entregues entre um calculo e outro do Ao vivo da RQ.
const c = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  resultadoAnterior: null as unknown,
  coerenciaFalhou: 0,
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
      if (tabela === 'kpi_ao_vivo_dia') return cadeia({ data: { romaneio: [{ placaNorm: 'AAA1A11', rua: 'RUA A' }] }, error: null })
      const o = cadeia({ data: c.resultadoAnterior ? { resultado: c.resultadoAnterior, calculado_em: '2026-10-20T12:00:00Z' } : null, error: null }) as Record<string, (...a: unknown[]) => unknown>
      o.update = (v: unknown) => {
        c.updates.push(v as Record<string, unknown>)
        return cadeia({ data: [{ cliente: 'rioquality' }], error: null })
      }
      return o
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }),
}))
vi.mock('@/lib/kpi-rioquality/pipeline', () => ({
  gerarKpiRioQuality: async () => ({ xlsx: Buffer.from(''), linhasKpi: [], detalhe: [], avisos: [], coerenciaFalhou: c.coerenciaFalhou }),
}))
vi.mock('@/lib/kpi-rioquality/frota', () => ({ buscarFrotaRioQuality: async () => new Map() }))
vi.mock('./resumo-dashboard', () => ({ extrairKpiCompleto: async () => ({ data: null, resumo: { cargas: [] }, nfs: [] }) }))

import { calcularAoVivo } from './ao-vivo-servico'

beforeEach(() => { c.updates = []; c.resultadoAnterior = null; c.coerenciaFalhou = 0 })

describe('RQ-08: ponte de coerencia fora nao publica resultado degradado', () => {
  it('com resultado anterior do dia: mantem o anterior e grava o erro', async () => {
    c.resultadoAnterior = { placas: [] }
    c.coerenciaFalhou = 12
    expect(await calcularAoVivo('rioquality', '2026-10-20')).toBe('erro')
    expect(c.updates.some(u => 'resultado' in u)).toBe(false)
    expect(String(c.updates.at(-1)?.ultimo_erro)).toContain('coerência')
  })
})
