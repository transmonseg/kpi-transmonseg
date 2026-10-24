import { describe, it, expect, vi } from 'vitest'
import { buscarComSessao, lerJson, SessaoVencida, urlLogin, voltaSegura } from './sessao-fetch'

// F3-11 (AC-03): helper de fetch das telas. 401 ou resposta redirecionada para o
// /login leva a pessoa para /login?volta=; HTML no lugar de JSON vira texto claro.

function resposta(corpo: string, init: { status?: number; tipo?: string; redirected?: boolean; url?: string } = {}) {
  const r = new Response(corpo, { status: init.status ?? 200, headers: { 'content-type': init.tipo ?? 'application/json' } })
  Object.defineProperty(r, 'redirected', { value: !!init.redirected })
  Object.defineProperty(r, 'url', { value: init.url ?? 'https://central.transmonseg.com.br/api/kpi/ao-vivo' })
  return r
}

describe('urlLogin / voltaSegura', () => {
  it('monta /login?volta= com o caminho atual', () => {
    expect(urlLogin('/painel/ao-vivo?cliente=rioquality')).toBe('/login?volta=%2Fpainel%2Fao-vivo%3Fcliente%3Drioquality')
  })
  it('aceita só caminho interno', () => {
    expect(voltaSegura('/painel/ao-vivo?cliente=nutrimax')).toBe('/painel/ao-vivo?cliente=nutrimax')
    expect(voltaSegura('//mal.com')).toBeNull()
    expect(voltaSegura('/\\mal.com')).toBeNull()
    expect(voltaSegura('https://mal.com')).toBeNull()
    expect(voltaSegura('/login?volta=/painel')).toBeNull()
    expect(voltaSegura('/api/kpi/ao-vivo')).toBeNull()
    expect(voltaSegura(undefined)).toBeNull()
    expect(voltaSegura('')).toBeNull()
  })
})

describe('buscarComSessao', () => {
  it('401: leva ao login com volta e lança SessaoVencida', async () => {
    const irPara = vi.fn()
    const f = vi.fn(async () => resposta('{"erro":"Sessão vencida."}', { status: 401 }))
    await expect(buscarComSessao('/api/kpi/ao-vivo?cliente=nutrimax', undefined, { fetch: f, irPara, atual: '/painel/ao-vivo' })).rejects.toBeInstanceOf(SessaoVencida)
    expect(irPara).toHaveBeenCalledWith('/login?volta=%2Fpainel%2Fao-vivo')
  })

  it('redirect seguido até o /login (servidor antigo, 307 -> HTML 200): também é sessão vencida', async () => {
    const irPara = vi.fn()
    const f = vi.fn(async () => resposta('<!DOCTYPE html><html>', { tipo: 'text/html', redirected: true, url: 'https://central.transmonseg.com.br/login?cliente=nutrimax' }))
    await expect(buscarComSessao('/api/kpi/ao-vivo?cliente=nutrimax', undefined, { fetch: f, irPara, atual: '/painel/ao-vivo' })).rejects.toBeInstanceOf(SessaoVencida)
    expect(irPara).toHaveBeenCalledTimes(1)
  })

  it('resposta normal passa direto, sem mexer na página', async () => {
    const irPara = vi.fn()
    const f = vi.fn(async () => resposta('{"ok":true}'))
    const r = await buscarComSessao('/api/x', { cache: 'no-store' }, { fetch: f, irPara, atual: '/painel' })
    expect(r.status).toBe(200)
    expect(f).toHaveBeenCalledWith('/api/x', { cache: 'no-store' })
    expect(irPara).not.toHaveBeenCalled()
  })

  it('403 não é sessão vencida (a tela decide)', async () => {
    const irPara = vi.fn()
    const f = vi.fn(async () => resposta('Sem permissão.', { status: 403, tipo: 'text/plain' }))
    const r = await buscarComSessao('/api/x', undefined, { fetch: f, irPara, atual: '/painel' })
    expect(r.status).toBe(403)
    expect(irPara).not.toHaveBeenCalled()
  })
})

describe('lerJson', () => {
  it('HTML no lugar de JSON vira mensagem clara, nunca "Unexpected token <"', async () => {
    const e = await lerJson(resposta('<!DOCTYPE html><html>', { tipo: 'text/html' })).catch(x => x as Error)
    expect(e).toBeInstanceOf(Error)
    expect((e as Error).message).not.toMatch(/Unexpected token/)
    expect((e as Error).message).toMatch(/servidor/i)
  })
  it('JSON normal', async () => {
    expect(await lerJson(resposta('{"a":1}'))).toEqual({ a: 1 })
  })
})
