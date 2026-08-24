import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  process.env.RAVEX_USUARIO = 'teste@exemplo.com'
  process.env.RAVEX_SENHA = 'senha-teste'
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.RAVEX_USUARIO
  delete process.env.RAVEX_SENHA
  vi.resetModules()
})

describe('obterTokenRavex', () => {
  it('faz login e devolve o access_token', async () => {
    const { obterTokenRavex } = await import('./ravex-auth')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'token-abc', expires_in: 1209599 }), { status: 200 }),
    )
    const token = await obterTokenRavex()
    expect(token).toBe('token-abc')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe('https://sistema.ravex.com.br/Token')
    expect(init?.method).toBe('POST')
    const corpo = String(init?.body)
    expect(corpo).toContain('grant_type=password')
    expect(corpo).toContain('username=teste%40exemplo.com')
    // senha vai em MD5, nunca em texto plano no corpo da requisicao
    expect(corpo).not.toContain('senha-teste')
  })

  it('login falho (conta bloqueada) lanca erro explicito, nao fail-open', async () => {
    const { obterTokenRavex } = await import('./ravex-auth')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'acesso_bloqueado', error_description: 'bloqueado' }), { status: 400 }),
    )
    await expect(obterTokenRavex()).rejects.toThrow(/acesso_bloqueado|bloqueado/)
  })

  it('reusa o token em memoria enquanto valido, sem chamar fetch de novo', async () => {
    const { obterTokenRavex } = await import('./ravex-auth')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'token-1', expires_in: 1209599 }), { status: 200 }),
    )
    const t1 = await obterTokenRavex()
    const t2 = await obterTokenRavex()
    expect(t1).toBe('token-1')
    expect(t2).toBe('token-1')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
