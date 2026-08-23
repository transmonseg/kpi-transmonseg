import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { geocodificarEnderecos } from './geocode'

// Arquitetura sequencial de proposito: uma UNICA chamada HTTP em lote
// (todos os enderecos de uma vez), nao uma promise por endereco -- ver
// comentario de GEOCODE_TIMEOUT_MS em geocode.ts. Por isso "timeout de um
// endereco nao trava os demais" aqui vira dois testes: (1) um endereco
// malformado NA RESPOSTA nao derruba os outros da mesma resposta, (2) o
// timeout/erro da chamada inteira nunca lanca -- fail-open pro lote todo.

beforeEach(() => {
  process.env.MOTOR_SECRET = 'segredo-teste'
  process.env.MONITORAMENTO_URL = 'http://127.0.0.1:3010'
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.MOTOR_SECRET
  delete process.env.MONITORAMENTO_URL
})

describe('geocodificarEnderecos', () => {
  it('lista vazia nao chama fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await geocodificarEnderecos([])).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('todos os enderecos geocodificam com sucesso', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ resultados: [{ lat: -22.8, lng: -43.2 }, { lat: -21.7, lng: -41.3 }] }),
        { status: 200 }
      )
    )
    const r = await geocodificarEnderecos(['Rua A, 1 - Bairro, Cidade', 'Rua B, 2 - Bairro, Cidade'])
    expect(r).toEqual([{ lat: -22.8, lng: -43.2 }, { lat: -21.7, lng: -41.3 }])
  })

  it('um endereco falha no meio -- fail-open, nao derruba os outros', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ resultados: [{ lat: -22.8, lng: -43.2 }, null, { lat: -21.7, lng: -41.3 }] }),
        { status: 200 }
      )
    )
    const r = await geocodificarEnderecos(['A', 'B', 'C'])
    expect(r).toEqual([{ lat: -22.8, lng: -43.2 }, null, { lat: -21.7, lng: -41.3 }])
  })

  it('entrada malformada num item nao derruba os demais', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ resultados: [{ lat: -22.8, lng: -43.2 }, { lat: 'nao-e-numero' }, { lat: -21.7, lng: -41.3 }] }),
        { status: 200 }
      )
    )
    const r = await geocodificarEnderecos(['A', 'B', 'C'])
    expect(r).toEqual([{ lat: -22.8, lng: -43.2 }, null, { lat: -21.7, lng: -41.3 }])
  })

  it('timeout/erro de rede na chamada inteira nao lanca -- devolve tudo null', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'))
    const r = await geocodificarEnderecos(['A', 'B', 'C'])
    expect(r).toEqual([null, null, null])
  })

  it('resposta HTTP de erro nao lanca -- devolve tudo null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    const r = await geocodificarEnderecos(['A', 'B'])
    expect(r).toEqual([null, null])
  })

  it('JSON invalido na resposta nao lanca -- devolve tudo null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nao e json', { status: 200 }))
    const r = await geocodificarEnderecos(['A'])
    expect(r).toEqual([null])
  })

  it("resposta sem campo 'resultados' valido nao lanca -- devolve tudo null", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const r = await geocodificarEnderecos(['A', 'B'])
    expect(r).toEqual([null, null])
  })

  it('resposta menor que o pedido nao lanca nem desalinha -- preenche o resto com null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ lat: -22.8, lng: -43.2 }] }), { status: 200 })
    )
    const r = await geocodificarEnderecos(['A', 'B', 'C'])
    expect(r).toEqual([{ lat: -22.8, lng: -43.2 }, null, null])
  })

  it('MOTOR_SECRET ausente nao chama fetch e devolve tudo null', async () => {
    delete process.env.MOTOR_SECRET
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await geocodificarEnderecos(['A', 'B'])
    expect(r).toEqual([null, null])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('manda o header x-motor-key e o corpo esperado', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ lat: 1, lng: 2 }] }), { status: 200 })
    )
    await geocodificarEnderecos(['Rua X, 1 - Bairro, Cidade'])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe('http://127.0.0.1:3010/api/romaneio/geocode')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>)['x-motor-key']).toBe('segredo-teste')
    expect(JSON.parse(init?.body as string)).toEqual({ enderecos: ['Rua X, 1 - Bairro, Cidade'] })
  })
})
