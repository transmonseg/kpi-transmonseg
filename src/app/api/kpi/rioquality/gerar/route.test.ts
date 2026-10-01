import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tarefa C (30/09): a rota recusava (422) qualquer dia fora das 48h da
// Unitrac, mesmo a pipeline ja' sabendo usar o snapshot noturno de paradas
// da RQ (Task 4). Agora: com snapshot do dia -> gera (e a pipeline recebe o
// MESMO snapshot lido, sem segunda leitura); sem snapshot -> 422.
const cenario = vi.hoisted(() => ({
  snapshot: new Map<string, unknown[]>(),
  snapshotErro: null as Error | null,
  leituras: [] as string[],
  chamadasPipeline: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u', email: 'a@b.c' } } }) } }),
}))
vi.mock('@/lib/perfil', () => ({ getPerfil: async () => ({ papel: 'admin' }), empresaLiberada: () => true }))
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-09-30' }))
vi.mock('@/lib/kpi-romaneio/historico', () => ({ salvarGeracao: vi.fn(async () => 'id'), buscarGeracaoParaRegenerar: async () => null }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ storage: { from: () => ({ upload: async () => ({ error: null }) }) } }),
}))
vi.mock('@/lib/kpi-rioquality/frota', () => ({ buscarFrotaRioQuality: async () => new Map([['AAA1A11', '1']]) }))
vi.mock('@/lib/kpi-romaneio/paradas-snapshot', () => ({
  lerSnapshotParadas: async (empresa: string, data: string) => {
    cenario.leituras.push(`${empresa}/${data}`)
    if (cenario.snapshotErro) throw cenario.snapshotErro
    return cenario.snapshot
  },
}))
vi.mock('@/lib/kpi-rioquality/pipeline', () => ({
  EntradaInvalidaError: class extends Error {},
  gerarKpiRioQuality: async (params: Record<string, unknown>) => {
    cenario.chamadasPipeline.push(params)
    return { xlsx: Buffer.from('xlsx'), linhasKpi: [] }
  },
}))

const { POST } = await import('./route')

function req(data: string) {
  const fd = new FormData()
  fd.set('data', data)
  fd.set('completo', new File([new Uint8Array([1])], 'entregas.xlsx'))
  return new Request('http://localhost/api/kpi/rioquality/gerar', { method: 'POST', body: fd })
}

beforeEach(() => {
  cenario.snapshot = new Map()
  cenario.snapshotErro = null
  cenario.leituras = []
  cenario.chamadasPipeline = []
})

describe('POST /api/kpi/rioquality/gerar -- dia fora das 48h', () => {
  it('sem snapshot de paradas da RQ pro dia -> 422, pipeline nao roda', async () => {
    const res = await POST(req('2026-09-25') as never)
    expect(res.status).toBe(422)
    expect(cenario.leituras).toEqual(['rioquality/2026-09-25'])
    expect(cenario.chamadasPipeline).toHaveLength(0)
  })

  it('com snapshot de paradas da RQ pro dia -> gera, e a pipeline recebe o mesmo snapshot', async () => {
    cenario.snapshot = new Map([['AAA1A11', [{ id: 'p1' }]]])
    const res = await POST(req('2026-09-25') as never)
    expect(res.status).toBe(200)
    expect(cenario.chamadasPipeline).toHaveLength(1)
    const lerSnapshot = cenario.chamadasPipeline[0].lerSnapshot as (e: string, d: string) => Promise<Map<string, unknown[]>>
    expect(await lerSnapshot('rioquality', '2026-09-25')).toBe(cenario.snapshot)
    expect(cenario.leituras).toHaveLength(1)
  })

  it('erro ao ler o snapshot -> 422 (nunca gera sem dado)', async () => {
    cenario.snapshotErro = new Error('db fora')
    const res = await POST(req('2026-09-25') as never)
    expect(res.status).toBe(422)
    expect(cenario.chamadasPipeline).toHaveLength(0)
  })

  it('dentro das 48h nao le snapshot na rota', async () => {
    const res = await POST(req('2026-09-29') as never)
    expect(res.status).toBe(200)
    expect(cenario.leituras).toHaveLength(0)
  })
})
