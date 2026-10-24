import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const acesso = vi.fn()
vi.mock('../../ao-vivo/acesso', () => ({ acessoAoVivo: (c: string | null) => acesso(c) }))
const porId = vi.fn()
vi.mock('@/lib/kpi-romaneio/resolucoes', () => ({ buscarResolucaoPorId: (...a: unknown[]) => porId(...a) }))
const baixar = vi.fn()
vi.mock('@/lib/kpi-romaneio/conferencia-servico', () => ({ baixarComprovante: (...a: unknown[]) => baixar(...a) }))

const req = (q: string) => new NextRequest(`http://x/api/kpi/resolucao/comprovante?${q}`)

beforeEach(() => {
  for (const f of [acesso, porId, baixar]) f.mockReset()
  acesso.mockImplementation(async (c: string | null) => ({ ok: true, cliente: c, email: 'e', clientes: [c] }))
})

describe('GET /api/kpi/resolucao/comprovante (F3-03)', () => {
  it('abre o anexo da conferência da própria empresa com o tipo certo', async () => {
    porId.mockResolvedValue({ id: 41, nf: '2437979', documento: 'comprovantes/nutrimax/2026-10-22/2437979-1-a.jpg' })
    baixar.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]))
    const { GET } = await import('./route')
    const res = await GET(req('cliente=nutrimax&id=41'))
    expect(porId).toHaveBeenCalledWith('NUTRY MAX', 41)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('content-disposition')).toBe('inline; filename="comprovante-nf-2437979.jpg"')
  })
  it('sem anexo, de outra empresa ou id torto: nada sai', async () => {
    const { GET } = await import('./route')
    porId.mockResolvedValue(null)
    expect((await GET(req('cliente=rioquality&id=41'))).status).toBe(404)
    expect(porId).toHaveBeenCalledWith('RIO QUALITY', 41)
    expect((await GET(req('cliente=nutrimax&id=abc'))).status).toBe(400)
    acesso.mockResolvedValue({ ok: false, resp: new NextResponse('Sem permissão.', { status: 403 }) })
    expect((await GET(req('cliente=nutrimax&id=41'))).status).toBe(403)
    expect(baixar).not.toHaveBeenCalled()
  })
})
