// @vitest-environment node
// (happy-dom filtra o header set-cookie em Response; aqui precisamos do Response real do Node)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Resposta de login bem-sucedido: corpo {success:true} + cookie PHPSESSID.
// (A Fusion também seta AWSALB*; aqui o PHPSESSID basta para o jar.)
const login = (sid: string) => new Response('{"success":true,"fantasia":"rioquality"}', { headers: { 'set-cookie': `PHPSESSID=${sid}; path=/` } })

describe('fusionPost', () => {
  beforeEach(() => { vi.resetModules(); process.env.FUSION_USER = 'u'; process.env.FUSION_PASS = 'p'; process.env.FUSION_BASE = 'https://fusiondms.com.br' })
  afterEach(() => vi.unstubAllGlobals())

  it('re-loga uma vez quando a resposta é a tela de login e depois devolve o JSON', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(login('sess1'))
      .mockResolvedValueOnce(new Response('<html><form id="login">', { status: 200, headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(login('sess2'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ total: 1, rows: [{ a: 1 }] }), { status: 200, headers: { 'content-type': 'text/html' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { fusionPost } = await import('./client')
    const r = await fusionPost<{ total: number }>('/php/x.php', { k: 'v' })
    expect(r.total).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    // o retry manda o cookie da 2ª sessão (jar completo)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((fetchMock.mock.calls[3][1] as any).headers.cookie).toContain('PHPSESSID=sess2')
  })

  it('re-loga quando a sessão morta vem como redirect 302 para login.html', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(login('sess1'))
      .mockResolvedValueOnce(new Response('', { status: 302, headers: { location: '/login.html' } }))
      .mockResolvedValueOnce(login('sess2'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ total: 1, rows: [{ a: 1 }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { fusionPost } = await import('./client')
    const r = await fusionPost<{ total: number }>('/php/x.php')
    expect(r.total).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('lança se a sessão continua morta após re-login', async () => {
    const html = () => new Response('<html><form id="login">', { status: 200, headers: { 'content-type': 'text/html' } })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(login('s')).mockResolvedValueOnce(html())
      .mockResolvedValueOnce(login('s')).mockResolvedValueOnce(html())
    vi.stubGlobal('fetch', fetchMock)
    const { fusionPost } = await import('./client')
    await expect(fusionPost('/php/x.php')).rejects.toThrow(/após re-login/)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('lança se as credenciais forem recusadas no login', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{"success":false}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { fusionPost } = await import('./client')
    await expect(fusionPost('/php/x.php')).rejects.toThrow(/credenciais|sessão/i)
  })
})
