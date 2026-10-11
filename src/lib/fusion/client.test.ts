// @vitest-environment node
// (happy-dom filtra o header set-cookie em Response; aqui precisamos do Response real do Node)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('fusionPost', () => {
  beforeEach(() => { vi.resetModules(); process.env.FUSION_USER='u'; process.env.FUSION_PASS='p'; process.env.FUSION_BASE='https://fusiondms.com.br' })
  afterEach(() => vi.unstubAllGlobals())

  it('re-loga uma vez quando a resposta é a tela de login e depois devolve o JSON', async () => {
    const fetchMock = vi.fn()
      // 1) login inicial
      .mockResolvedValueOnce(new Response('ok', { headers: { 'set-cookie': 'PHPSESSID=sess1; path=/' } }))
      // 2) chamada de dado: sessão morta (HTML de login)
      .mockResolvedValueOnce(new Response('<html><form id="login">', { status: 200, headers: { 'content-type': 'text/html' } }))
      // 3) re-login
      .mockResolvedValueOnce(new Response('ok', { headers: { 'set-cookie': 'PHPSESSID=sess2; path=/' } }))
      // 4) retry com dado real
      .mockResolvedValueOnce(new Response(JSON.stringify({ total: 1, rows: [{ a: 1 }] }), { status: 200, headers: { 'content-type': 'text/html' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { fusionPost } = await import('./client')
    const r = await fusionPost<{ total: number }>('/php/x.php', { k: 'v' })
    expect(r.total).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((fetchMock.mock.calls[3][1] as any).headers.cookie).toContain('PHPSESSID=sess2')
  })

  it('re-loga quando a sessão morta vem como redirect 302 para login.html', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('ok', { headers: { 'set-cookie': 'PHPSESSID=sess1; path=/' } }))
      .mockResolvedValueOnce(new Response('', { status: 302, headers: { location: '/login.html' } }))
      .mockResolvedValueOnce(new Response('ok', { headers: { 'set-cookie': 'PHPSESSID=sess2; path=/' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ total: 1, rows: [{ a: 1 }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { fusionPost } = await import('./client')
    const r = await fusionPost<{ total: number }>('/php/x.php')
    expect(r.total).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('lança se a sessão continua morta após re-login', async () => {
    const html = new Response('<html><form id="login">', { status: 200, headers: { 'content-type': 'text/html' } })
    const login = new Response('ok', { headers: { 'set-cookie': 'PHPSESSID=s; path=/' } })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(login).mockResolvedValueOnce(html.clone())
      .mockResolvedValueOnce(login).mockResolvedValueOnce(html.clone())
    vi.stubGlobal('fetch', fetchMock)
    const { fusionPost } = await import('./client')
    await expect(fusionPost('/php/x.php')).rejects.toThrow(/após re-login/)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
