import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// F3-07 (ACH-04): checklist da manhã no topo do Ao vivo.
const acesso = vi.fn()
vi.mock('../acesso', () => ({ clientesDoAoVivo: () => acesso() }))
vi.mock('@/lib/data-br', () => ({ hojeBR: () => '2026-10-21' }))
const lerManha = vi.fn()
vi.mock('@/lib/kpi-romaneio/manha-servico', () => ({ lerManha: (...a: unknown[]) => lerManha(...a) }))

beforeEach(() => { acesso.mockReset(); lerManha.mockReset() })

describe('GET /api/kpi/ao-vivo/manha', () => {
  it('sem sessão/sem permissão devolve a resposta do acesso', async () => {
    acesso.mockResolvedValue({ ok: false, resp: new NextResponse('Não autenticado', { status: 401 }) })
    const { GET } = await import('./route')
    expect((await GET()).status).toBe(401)
    expect(lerManha).not.toHaveBeenCalled()
  })

  it('lê hoje (BRT) só com os clientes do login', async () => {
    acesso.mockResolvedValue({ ok: true, clientes: ['rioquality'] })
    lerManha.mockResolvedValue({ itens: [{ chave: 'rq', ok: false }], banners: [] })
    const { GET } = await import('./route')
    const r = await GET()
    expect(r.status).toBe(200)
    expect(lerManha).toHaveBeenCalledWith(['rioquality'], '2026-10-21')
    expect(await r.json()).toEqual({ data: '2026-10-21', itens: [{ chave: 'rq', ok: false }], banners: [] })
  })

  it('falha do banco => 503 com texto (a tela segue sem o checklist)', async () => {
    acesso.mockResolvedValue({ ok: true, clientes: ['nutrimax'] })
    lerManha.mockRejectedValue(new Error('rede'))
    const { GET } = await import('./route')
    expect((await GET()).status).toBe(503)
  })
})
