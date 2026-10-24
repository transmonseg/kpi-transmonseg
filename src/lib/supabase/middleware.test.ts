import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// F3-11 (AC-03): sessão vencida. Medido em 23/10: GET /api/kpi/ao-vivo?cliente=nutrimax
// sem cookie -> 307 para /login?cliente=nutrimax; o Ao vivo lia o HTML do /login como
// JSON ("Unexpected token <") e tentava de novo a cada 10 s, para sempre.

const estado = vi.hoisted(() => ({
  user: null as { id: string } | null,
  perfil: { papel: 'admin', redes: [], meses: [], empresas: [] } as { papel: string; redes: string[]; meses: string[]; empresas: string[] },
}))

vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({}) }))
vi.mock('./desktop-auth', () => ({ resolveUserDesktopAware: async () => estado.user }))
vi.mock('@/lib/perfil', () => ({ getPerfil: async () => estado.perfil }))
vi.mock('./url', () => ({ urlSupabaseServidor: () => 'http://x', nomeCookieSessao: () => 'sb-x-auth-token' }))

import { updateSession } from './middleware'

const req = (caminho: string) => new NextRequest(new URL(caminho, 'https://central.transmonseg.com.br'))

beforeEach(() => {
  estado.user = null
  estado.perfil = { papel: 'admin', redes: [], meses: [], empresas: [] }
})

describe('sessão vencida (F3-11)', () => {
  it('/api/* sem usuário responde 401 em JSON, sem redirect', async () => {
    const r = await updateSession(req('/api/kpi/ao-vivo?cliente=nutrimax'))
    expect(r.status).toBe(401)
    expect(r.headers.get('location')).toBeNull()
    expect(r.headers.get('content-type')).toMatch(/application\/json/)
    const corpo = await r.json()
    expect(corpo.erro).toMatch(/sessão/i)
  })

  it('o passe do monitoramento embutido também recebe 401 (a tela já espera esse status)', async () => {
    const r = await updateSession(req('/api/monitoramento/passe'))
    expect(r.status).toBe(401)
  })

  it('página sem usuário vai para /login?volta= com o caminho e a busca', async () => {
    const r = await updateSession(req('/painel/ao-vivo?cliente=rioquality'))
    expect(r.status).toBe(307)
    const destino = new URL(r.headers.get('location')!)
    expect(destino.pathname).toBe('/login')
    expect(destino.searchParams.get('volta')).toBe('/painel/ao-vivo?cliente=rioquality')
    expect(destino.searchParams.get('cliente')).toBeNull()
  })

  it('rotas públicas continuam abertas', async () => {
    const r = await updateSession(req('/api/dashboard/publico'))
    expect(r.status).toBe(200)
  })
})

describe('logado abrindo /login (F3-11: volta)', () => {
  it('admin sem volta continua indo ao painel', async () => {
    estado.user = { id: 'u2' }
    const r = await updateSession(req('/login'))
    expect(new URL(r.headers.get('location')!).pathname).toBe('/painel')
  })

  it('com ?volta= seguro, volta para onde estava', async () => {
    estado.user = { id: 'u2' }
    const r = await updateSession(req('/login?volta=' + encodeURIComponent('/painel/ao-vivo?cliente=rioquality')))
    const destino = new URL(r.headers.get('location')!)
    expect(destino.pathname + destino.search).toBe('/painel/ao-vivo?cliente=rioquality')
  })

  it('?volta= para outro site é ignorado', async () => {
    estado.user = { id: 'u2' }
    const r = await updateSession(req('/login?volta=' + encodeURIComponent('//mal.com/x')))
    const destino = new URL(r.headers.get('location')!)
    expect(destino.host).toBe('central.transmonseg.com.br')
    expect(destino.pathname).toBe('/painel')
  })
})

describe('operador logado abrindo /login cai no Ao vivo (F3-12)', () => {
  it('operador da Nutry', async () => {
    estado.user = { id: 'u1' }
    estado.perfil = { papel: 'operador', redes: [], meses: [], empresas: ['nutrimax'] }
    const r = await updateSession(req('/login'))
    expect(new URL(r.headers.get('location')!).pathname).toBe('/painel/ao-vivo')
  })
  it('operador só do monitoramento continua no painel', async () => {
    estado.user = { id: 'u1' }
    estado.perfil = { papel: 'operador', redes: [], meses: [], empresas: [] }
    const r = await updateSession(req('/login'))
    expect(new URL(r.headers.get('location')!).pathname).toBe('/painel')
  })
})

describe('operador alcança a fila Conferir e o Resumo do dia (F3-R01)', () => {
  const rotas = [
    '/api/kpi/resolucao?cliente=nutrimax&data=2026-10-22',
    '/api/kpi/resolucao/comprovante?cliente=nutrimax&id=x',
    '/api/kpi/resumo-dia?cliente=nutrimax&data=2026-10-22',
    '/painel/resumo-dia?cliente=nutrimax&data=2026-10-22',
  ]
  for (const empresa of ['nutrimax', 'rioquality']) {
    for (const rota of rotas) {
      it(`operador ${empresa}: ${rota.split('?')[0]} passa pelo proxy`, async () => {
        estado.user = { id: 'erica' }
        estado.perfil = { papel: 'operador', redes: [], meses: [], empresas: [empresa] }
        const r = await updateSession(req(rota.replace('nutrimax', empresa)))
        expect(r.status).toBe(200)
        expect(r.headers.get('location')).toBeNull()
      })
    }
  }
  it('operador só do monitoramento continua sem acesso à resolução', async () => {
    estado.user = { id: 'u1' }
    estado.perfil = { papel: 'operador', redes: [], meses: [], empresas: [] }
    const r = await updateSession(req('/api/kpi/resolucao?cliente=nutrimax&data=2026-10-22'))
    expect(r.status).toBe(403)
  })
  it('gerente/visualizador continua sem acesso à resolução e ao resumo', async () => {
    estado.user = { id: 'u1' }
    estado.perfil = { papel: 'visualizador', redes: [], meses: [], empresas: ['nutrimax'] }
    expect((await updateSession(req('/api/kpi/resolucao?cliente=nutrimax&data=2026-10-22'))).status).toBe(403)
    expect((await updateSession(req('/api/kpi/resumo-dia?cliente=nutrimax&data=2026-10-22'))).status).toBe(403)
    expect(new URL((await updateSession(req('/painel/resumo-dia'))).headers.get('location')!).pathname).toBe('/painel')
  })
  it('caminho parecido não é liberado', async () => {
    estado.user = { id: 'u1' }
    estado.perfil = { papel: 'operador', redes: [], meses: [], empresas: ['nutrimax'] }
    expect((await updateSession(req('/api/kpi/resolucaoX'))).status).toBe(403)
    expect((await updateSession(req('/api/kpi/resumo-dia-x'))).status).toBe(403)
  })
})
