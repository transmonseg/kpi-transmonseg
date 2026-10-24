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
  uploads: [] as string[],
  uploadKpiErro: false,
  geracao: null as null | Record<string, string | null>,
  frotaErro: false,
  // F3-05 (AC-13): o que a porta do dia gravou no Ao vivo / mandou ao monitoramento.
  entregasPlanilha: [] as Record<string, unknown>[],
  portaGuardou: [] as { data: string; n: number; por: string | null }[],
  portaEnviou: [] as { data: string; n: number; por: string | null }[],
  portaLida: null as Record<string, unknown>[] | null,
}))
vi.mock('@/lib/kpi-rioquality/parse-planilhas', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/kpi-rioquality/parse-planilhas')>()),
  parseEntregasCompletas: () => cenario.entregasPlanilha,
}))
vi.mock('@/lib/kpi-romaneio/porta-do-dia-servico', () => ({
  depsReaisPortaRQ: {
    lerEntregas: async () => cenario.portaLida,
    guardar: async (data: string, e: unknown[], por: string | null) => { cenario.portaGuardou.push({ data, n: e.length, por }) },
    enviarMonitoramento: async (data: string, e: unknown[], por: string | null) => { cenario.portaEnviou.push({ data, n: e.length, por }); return { ok: true, linhasDoDia: e.length } },
  },
  depoisDaGeracao: () => {},
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u', email: 'a@b.c' } } }) } }),
}))
vi.mock('@/lib/perfil', () => ({ getPerfil: async () => ({ papel: 'admin' }), empresaLiberada: () => true, podeOperarEmpresa: () => true }))
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-09-30' }))
vi.mock('@/lib/kpi-romaneio/historico', () => ({ salvarGeracao: vi.fn(async () => 'id'), buscarGeracaoParaRegenerar: async () => cenario.geracao }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ storage: { from: () => ({
    upload: async (path: string) => {
      if (cenario.uploadKpiErro && path.endsWith('-kpi.xlsx')) return { error: { message: 'boom' } }
      cenario.uploads.push(path)
      return { error: null }
    },
    download: async () => ({ data: new Blob(['x']), error: null }),
  }) } }),
}))
vi.mock('@/lib/kpi-rioquality/frota', () => {
  class FrotaRioQualityIndisponivelError extends Error {}
  return {
    FrotaRioQualityIndisponivelError,
    buscarFrotaRioQuality: async () => {
      if (cenario.frotaErro) throw new FrotaRioQualityIndisponivelError('Não consegui ler a frota da Rio Quality (statement timeout).')
      return new Map([['AAA1A11', '1']])
    },
  }
})
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
const { salvarGeracao: salvarGeracaoMock } = await import('@/lib/kpi-romaneio/historico')

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
  cenario.uploads = []
  cenario.uploadKpiErro = false
  cenario.geracao = null
  cenario.frotaErro = false
  vi.mocked(salvarGeracaoMock).mockClear()
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

// Item 1 (auditoria 01/10): o xlsx gerado tambem vai pro Storage.
describe('POST /api/kpi/rioquality/gerar -- guarda o xlsx gerado', () => {
  it('geracao nova: <prefixo>-kpi.xlsx ao lado do -completo.xlsx, gravado em arquivoStoragePath', async () => {
    const res = await POST(req('2026-09-29') as never)
    expect(res.status).toBe(200)
    const arg = vi.mocked(salvarGeracaoMock).mock.calls[0][0]
    const prefixo = String(arg.romaneioStoragePath).replace(/-completo\.xlsx$/, '')
    expect(arg.arquivoStoragePath).toBe(`${prefixo}-kpi.xlsx`)
    expect(cenario.uploads).toContain(`${prefixo}-kpi.xlsx`)
  })

  it('falha no upload do xlsx: 200, arquivoStoragePath null', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    cenario.uploadKpiErro = true
    const res = await POST(req('2026-09-29') as never)
    expect(res.status).toBe(200)
    expect(vi.mocked(salvarGeracaoMock).mock.calls[0][0].arquivoStoragePath).toBeNull()
    err.mockRestore()
  })

  it('regeneracao tambem salva o xlsx', async () => {
    cenario.geracao = { id: 'g', dataReferencia: '2026-09-29', escalaStoragePath: null, romaneioStoragePath: 'rioquality/2026-09-29/a-completo.xlsx', paoStoragePath: null }
    const fd = new FormData(); fd.set('regenerarDeId', 'g')
    const res = await POST(new Request('http://localhost/api/kpi/rioquality/gerar', { method: 'POST', body: fd }) as never)
    expect(res.status).toBe(200)
    const arg = vi.mocked(salvarGeracaoMock).mock.calls[0][0]
    expect(arg.arquivoStoragePath).toMatch(/^rioquality\/2026-09-29\/.+-kpi\.xlsx$/)
    expect(cenario.uploads).toEqual([arg.arquivoStoragePath])
  })
})

// F1-12 (KRQ-09): frota ilegivel nao gera KPI com todas as NFs "sem rastreador".
describe('POST /api/kpi/rioquality/gerar -- frota da RQ ilegivel', () => {
  it('-> 503 com a mensagem, pipeline nao roda e nada e\' salvo', async () => {
    cenario.frotaErro = true
    const res = await POST(req('2026-09-29') as never)
    expect(res.status).toBe(503)
    expect(await res.text()).toContain('frota da Rio Quality')
    expect(cenario.chamadasPipeline).toHaveLength(0)
    expect(vi.mocked(salvarGeracaoMock)).not.toHaveBeenCalled()
  })
})

// F3-05 (AC-13): RQ 21/10 -- duas gerações (14:49 e 14:59 BRT) e a subida no
// Ao vivo às 15:01, 3 envios do mesmo dia em 12 min, sem reparo para a RQ.
describe('POST /api/kpi/rioquality/gerar -- KPI de hoje também entra no Ao vivo e no monitoramento (F3-05)', () => {
  beforeEach(() => {
    cenario.entregasPlanilha = [{ placaNorm: 'LNH9C10', nf: '5557757', rua: 'RUA IMBOASSU' }, { placaNorm: 'LNH9C10', nf: '5557758', rua: 'RUA X' }]
    cenario.portaGuardou = []; cenario.portaEnviou = []; cenario.portaLida = null
  })

  it('1ª geração de hoje: Ao vivo e monitoramento recebem a planilha com o e-mail de quem gerou', async () => {
    const res = await POST(req('2026-09-30') as never)
    expect(res.status).toBe(200)
    expect(cenario.portaGuardou).toEqual([{ data: '2026-09-30', n: 2, por: 'a@b.c' }])
    expect(cenario.portaEnviou).toEqual([{ data: '2026-09-30', n: 2, por: 'a@b.c' }])
    expect(res.headers.get('x-ao-vivo')).toBe('gravado')
  })

  it('2ª geração com a mesma planilha: nada é reenviado', async () => {
    cenario.portaLida = cenario.entregasPlanilha
    const res = await POST(req('2026-09-30') as never)
    expect(res.status).toBe(200)
    expect(cenario.portaGuardou).toHaveLength(0)
    expect(cenario.portaEnviou).toHaveLength(0)
    expect(res.headers.get('x-ao-vivo')).toBe('igual')
  })

  it('dia passado: Ao vivo intocado', async () => {
    const res = await POST(req('2026-09-29') as never)
    expect(res.status).toBe(200)
    expect(cenario.portaGuardou).toHaveLength(0)
    expect(res.headers.get('x-ao-vivo')).toBe('nao')
  })
})
