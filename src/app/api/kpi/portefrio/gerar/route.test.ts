import { describe, it, expect, vi, beforeEach } from 'vitest'

// Item 1 (auditoria 01/10): o xlsx gerado da Portefrio tambem vai pro
// Storage (bucket dos inputs, `portefrio/<data>/<uuid>-kpi.xlsx`) e o
// caminho fica em arquivo_storage_path. Falha no upload so' loga.
const cenario = vi.hoisted(() => ({ uploads: [] as string[], uploadErro: false }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u', email: 'a@b.c' } } }) } }),
}))
vi.mock('@/lib/perfil', () => ({ getPerfil: async () => ({ papel: 'admin' }), empresaLiberada: () => true }))
vi.mock('@/lib/kpi-romaneio/historico', () => ({ salvarGeracao: vi.fn(async () => 'id') }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ storage: { from: () => ({
    upload: async (path: string) => {
      if (cenario.uploadErro) return { error: { message: 'boom' } }
      cenario.uploads.push(path)
      return { error: null }
    },
  }) } }),
}))
vi.mock('@/lib/kpi-romaneio/geocode', () => ({
  geocodificarEnderecos: async (e: string[]) => e.map(() => ({ lat: -22.9, lng: -43.2, confiavel: true })),
}))
vi.mock('@/lib/kpi-portefrio/parse-romaneio', () => ({
  parseRomaneioPortefrio: async () => [{ placa: 'AAA1A11', codigoCliente: 'C1', ordem: 1, endereco: 'RUA A', bairro: 'B', cidade: 'RIO' }],
}))
vi.mock('@/lib/kpi-portefrio/agregacao', () => ({
  enderecoCompleto: () => 'RUA A, B, RIO',
  agregarPorCliente: () => ({}),
}))
vi.mock('@/lib/kpi-portefrio/ravex-api', () => ({ resolverIdVeiculo: async () => null, buscarHistoricoVeiculo: async () => [] }))
vi.mock('@/lib/kpi-portefrio/visitas', () => ({ montarVisitas: () => new Map() }))
vi.mock('@/lib/kpi-portefrio/gerador-xlsx', () => ({ gerarKpiPortefrioXlsx: async () => Buffer.from('xlsx-pf') }))

const { POST } = await import('./route')
const { salvarGeracao } = await import('@/lib/kpi-romaneio/historico')

function req() {
  const fd = new FormData()
  fd.set('data', '2026-10-01')
  fd.set('romaneio', new File(['pdf'], 'r.pdf'))
  return new Request('http://localhost/api/kpi/portefrio/gerar', { method: 'POST', body: fd }) as never
}

beforeEach(() => {
  cenario.uploads = []
  cenario.uploadErro = false
  vi.mocked(salvarGeracao).mockClear()
})

describe('POST /api/kpi/portefrio/gerar -- guarda o xlsx gerado', () => {
  it('sobe portefrio/<data>/<uuid>-kpi.xlsx e grava em arquivoStoragePath', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    const arg = vi.mocked(salvarGeracao).mock.calls[0][0]
    expect(arg.arquivoStoragePath).toMatch(/^portefrio\/2026-10-01\/[0-9a-f-]{36}-kpi\.xlsx$/)
    expect(cenario.uploads).toEqual([arg.arquivoStoragePath])
  })

  it('falha no upload: 200 com o xlsx, arquivoStoragePath null', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    cenario.uploadErro = true
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('xlsx-pf')
    expect(vi.mocked(salvarGeracao).mock.calls[0][0].arquivoStoragePath).toBeNull()
    err.mockRestore()
  })
})
