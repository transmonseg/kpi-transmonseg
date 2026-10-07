import { describe, it, expect, vi, afterEach } from 'vitest'
import { criarContaMonitoramento } from './acessos-monitoramento'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('criarContaMonitoramento (convite cria a conta nos dois sistemas)', () => {
  it('manda email, senha e empresas com a chave da ponte', async () => {
    vi.stubEnv('MOTOR_SECRET', 'k'); vi.stubEnv('MONITORAMENTO_URL', 'http://mon')
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, cliente: 'Rio Quality' })))
    vi.stubGlobal('fetch', f)
    expect(await criarContaMonitoramento({ email: 'a@b.co', senha: '123456', papel: 'operador', empresas: ['rioquality'] })).toBe('criada (Rio Quality)')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://mon/api/acessos/criar-conta')
    expect((init.headers as Record<string, string>)['x-motor-key']).toBe('k')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@b.co', senha: '123456', admin: false, empresas: ['rioquality'] })
  })
  it('sem empresa do monitoramento: nem chama', async () => {
    vi.stubEnv('MOTOR_SECRET', 'k')
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    expect(await criarContaMonitoramento({ email: 'a@b.co', senha: '123456', papel: 'gerente', empresas: ['benassi'] })).toBe('sem cliente do monitoramento')
    expect(f).not.toHaveBeenCalled()
  })
  it('erro do monitoramento vira texto, nunca exceção', async () => {
    vi.stubEnv('MOTOR_SECRET', 'k')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fora do ar') }))
    expect(await criarContaMonitoramento({ email: 'a@b.co', senha: '123456', papel: 'operador', empresas: ['nutrimax'] })).toBe('erro: fora do ar')
  })
})
