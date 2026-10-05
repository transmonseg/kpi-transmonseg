import { describe, it, expect, vi, beforeEach } from 'vitest'

// Item 1 (auditoria 01/10): baixa o xlsx GUARDADO de uma geracao (sem
// regenerar). Mesma regra de acesso das rotas gerar: admin + empresa.
const cenario = vi.hoisted(() => ({
  user: { id: 'u' } as null | { id: string },
  perfil: { papel: 'admin', empresas: ['nutrimax'] } as { papel: string; empresas: string[] },
  row: null as null | Record<string, string | null>,
  arquivo: 'conteudo-xlsx' as string | null,
  baixados: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: cenario.user } }) } }),
}))
vi.mock('@/lib/perfil', () => ({
  getPerfil: async () => cenario.perfil,
  empresaLiberada: (p: { papel: string; empresas: string[] }, e: string) => p.papel === 'admin' || p.empresas.includes(e),
  podeOperarEmpresa: (p: { papel: string; empresas: string[] }, e: string) => p.papel === 'admin' || (p.papel === 'operador' && p.empresas.includes(e)),
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cenario.row, error: null }) }) }) }),
    storage: { from: () => ({
      download: async (p: string) => {
        cenario.baixados.push(p)
        return cenario.arquivo === null ? { data: null, error: { message: 'x' } } : { data: new Blob([cenario.arquivo]), error: null }
      },
    }) },
  }),
}))

const { GET } = await import('./route')
const chamar = () => GET(new Request('http://x') as never, { params: Promise.resolve({ id: 'g1' }) })

beforeEach(() => {
  cenario.user = { id: 'u' }
  cenario.perfil = { papel: 'admin', empresas: ['nutrimax'] }
  cenario.row = { cliente: 'nutrimax', data_referencia: '2026-10-01', arquivo_storage_path: 'nutrimax/2026-10-01/abc-kpi.xlsx' }
  cenario.arquivo = 'conteudo-xlsx'
  cenario.baixados = []
})

describe('GET /api/kpi/historico/[id]/xlsx', () => {
  it('devolve o xlsx guardado como anexo, sem regenerar', async () => {
    const res = await chamar()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml')
    expect(res.headers.get('Content-Disposition')).toContain('KPI-Nutry-Max-2026-10-01.xlsx')
    expect(await res.text()).toBe('conteudo-xlsx')
    expect(cenario.baixados).toEqual(['nutrimax/2026-10-01/abc-kpi.xlsx'])
  })

  it('sem login -> 401', async () => {
    cenario.user = null
    expect((await chamar()).status).toBe(401)
  })

  it('nao-admin -> 403', async () => {
    cenario.perfil = { papel: 'cliente', empresas: ['nutrimax'] }
    expect((await chamar()).status).toBe(403)
  })

  it('geracao sem arquivo guardado -> 404', async () => {
    cenario.row = { cliente: 'nutrimax', data_referencia: '2026-10-01', arquivo_storage_path: null }
    expect((await chamar()).status).toBe(404)
  })

  it('geracao inexistente -> 404', async () => {
    cenario.row = null
    expect((await chamar()).status).toBe(404)
  })

  it('erro no download -> 500', async () => {
    cenario.arquivo = null
    expect((await chamar()).status).toBe(500)
  })
})
