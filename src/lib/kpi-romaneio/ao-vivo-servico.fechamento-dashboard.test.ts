import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// F3-01 (ACH-01): o calculo do dia encerrado (fechamento das 00:30,
// reconferencia das 05:30, recalculo depois) leva o resultado ao Dashboard
// pela regra do fechamento-dashboard.ts (ausente/parcial grava; manual
// diferente vira oferta). Calculo do dia corrente e calculo incompleto nao.
const c = vi.hoisted(() => ({
  publicados: [] as { cliente: string; data: string; calculadoEm: string; xlsx: string; taxa: number | null }[],
  publicarFalha: false,
  resultadoAnterior: null as unknown,
  coerenciaFalhou: 0,
}))

function cadeia(resultado: unknown) {
  const o: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'or', 'update', 'upsert', 'lt', 'gte', 'order', 'limit']) o[m] = () => o
  o.maybeSingle = async () => resultado
  o.then = (res: (v: unknown) => void) => res(resultado)
  return o
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (tabela: string) => {
      if (tabela === 'kpi_ao_vivo_dia') return cadeia({ data: { romaneio: [{ placaNorm: 'AAA1A11', rua: 'RUA A' }] }, error: null })
      const o = cadeia({ data: c.resultadoAnterior ? { resultado: c.resultadoAnterior, calculado_em: '2026-10-23T23:50:00Z' } : null, error: null }) as Record<string, (...a: unknown[]) => unknown>
      o.update = () => cadeia({ data: [{ cliente: 'rioquality' }], error: null })
      return o
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        download: async () => ({ data: new Blob([Buffer.from('planilha-boa-anterior')]), error: null }),
      }),
    },
  }),
}))
vi.mock('@/lib/kpi-rioquality/pipeline', () => ({
  gerarKpiRioQuality: async () => ({ xlsx: Buffer.from('planilha-final'), linhasKpi: [], detalhe: [], avisos: [], coerenciaFalhou: c.coerenciaFalhou }),
}))
vi.mock('@/lib/kpi-rioquality/frota', () => ({ buscarFrotaRioQuality: async () => new Map([['AAA1A11', '1']]) }))
vi.mock('./paradas-snapshot', () => ({ lerSnapshotParadas: async () => new Map() }))
vi.mock('./versao-regras', () => ({ versaoDasRegras: () => '0f495b4' }))
vi.mock('./resumo-dashboard', () => ({
  extrairKpiCompleto: async () => ({ data: '2026-10-22', resumo: { taxa: 91.4, entregues: 2633, nfsNaConta: 2881, aguardando: 0, cargas: [] }, nfs: [] }),
}))
vi.mock('./fechamento-dashboard', () => ({
  publicarFechamentoNoDashboard: async (p: { cliente: string; data: string; calculadoEm: string; xlsx: Buffer; lido: { resumo: { taxa: number | null } } }) => {
    if (c.publicarFalha) throw new Error('dashboard fora')
    c.publicados.push({ cliente: p.cliente, data: p.data, calculadoEm: p.calculadoEm, xlsx: p.xlsx.toString(), taxa: p.lido.resumo.taxa })
    return { acao: 'gravar', motivo: 'ausente' }
  },
}))

import { calcularAoVivo } from './ao-vivo-servico'

beforeEach(() => {
  c.publicados = []; c.publicarFalha = false; c.resultadoAnterior = null; c.coerenciaFalhou = 0
  // 23/10 00:30 BRT: fechamento do dia 22/10 (RQ ausente no Dashboard).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-23T03:31:15Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('F3-01: o fechamento das 00:30 vai ao Dashboard', () => {
  it('RQ 22/10 fechado: publica a planilha final com a taxa do fechamento', async () => {
    expect(await calcularAoVivo('rioquality', '2026-10-22')).toBe('ok')
    expect(c.publicados).toEqual([{ cliente: 'rioquality', data: '2026-10-22', calculadoEm: '2026-10-23T03:31:15.000Z', xlsx: 'planilha-final', taxa: 91.4 }])
  })
  it('calculo do dia corrente nao mexe no Dashboard', async () => {
    expect(await calcularAoVivo('rioquality', '2026-10-23')).toBe('ok')
    expect(c.publicados).toEqual([])
  })
  it('fechamento degradado (ponte de coerencia fora, sem resultado bom): nao vai ao Dashboard', async () => {
    c.coerenciaFalhou = 200
    await calcularAoVivo('rioquality', '2026-10-22')
    expect(c.publicados).toEqual([])
  })
  it('fechamento degradado que mantem o resultado anterior: nao vai ao Dashboard', async () => {
    c.coerenciaFalhou = 200
    c.resultadoAnterior = { placas: [] }
    expect(await calcularAoVivo('rioquality', '2026-10-22')).toBe('erro')
    expect(c.publicados).toEqual([])
  })
  it('falha ao gravar no Dashboard nao derruba o calculo do Ao vivo', async () => {
    c.publicarFalha = true
    expect(await calcularAoVivo('rioquality', '2026-10-22')).toBe('ok')
  })
})
