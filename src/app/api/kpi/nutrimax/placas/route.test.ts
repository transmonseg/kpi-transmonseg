import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({
  perfil: { papel: 'operador', redes: [], meses: [], empresas: ['nutrimax'] } as { papel: string; redes: string[]; meses: string[]; empresas: string[] },
  inserts: [] as { tabela: string; linha: Record<string, unknown> }[],
}))

vi.mock('@/lib/supabase/usuario-atual', () => ({ usuarioAtual: async () => ({ id: 'u1', email: 'ana@teste.com' }) }))
vi.mock('@/lib/perfil', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/perfil')>()
  return { ...real, getPerfil: async () => c.perfil }
})
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (tabela: string) => ({
      insert: (linha: Record<string, unknown>) => {
        c.inserts.push({ tabela, linha })
        return { select: () => ({ single: async () => ({ data: { id: 1, ...linha }, error: null }) }) }
      },
    }),
  }),
}))

import { POST } from './route'

const req = (body: unknown) => new Request('http://x/api/kpi/nutrimax/placas', { method: 'POST', body: JSON.stringify(body) }) as never

beforeEach(() => {
  c.perfil = { papel: 'operador', redes: [], meses: [], empresas: ['nutrimax'] }
  c.inserts = []
})

describe('POST /api/kpi/nutrimax/placas', () => {
  it('sem a Nutry Max liberada pra operar: 403', async () => {
    c.perfil = { papel: 'visualizador', redes: [], meses: [], empresas: ['nutrimax'] }
    const res = await POST(req({ tipo: 'sem_rastreador', placa: 'AAA1A11', inicio: '2026-10-05' }))
    expect(res.status).toBe(403)
  })

  it('sem rastreador: normaliza a placa e grava com responsável', async () => {
    const res = await POST(req({ tipo: 'sem_rastreador', placa: ' rqv-5f67 ', inicio: '2026-10-05', motivo: 'equipamento' }))
    expect(res.status).toBe(200)
    expect(c.inserts[0]).toMatchObject({ tabela: 'kpi_placa_sem_rastreador', linha: { empresa: 'NUTRY MAX', placa: 'RQV5F67', inicio: '2026-10-05', responsavel: 'ana@teste.com' } })
  })

  it('D-28: troca pela rota antiga não grava (vai pela rota do Ao vivo)', async () => {
    const res = await POST(req({ tipo: 'troca', data: '2026-10-03', placaEscala: 'RBG-4F53', placaReal: 'rqv5f67', carga: '' }))
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/ao-vivo\/troca/)
    expect(c.inserts).toHaveLength(0)
  })

  it('data inválida: 400', async () => {
    const res = await POST(req({ tipo: 'sem_rastreador', placa: 'AAA1A11', inicio: '05/10/2026' }))
    expect(res.status).toBe(400)
  })
})
