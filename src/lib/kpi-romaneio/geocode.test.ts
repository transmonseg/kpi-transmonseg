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

  it('lote com mais de um endereco 100% null (erro de rede) loga aviso explicito', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await geocodificarEnderecos(['A', 'B'])
    expect(r).toEqual([null, null])
    expect(errorSpy.mock.calls.some(args =>
      String(args[0]).includes('geocodificação falhou para 100% do lote'),
    )).toBe(true)
  })

  it('lote com mais de um endereco 100% null (resposta ok mas todos os itens invalidos) loga aviso explicito', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [null, null] }), { status: 200 }),
    )
    const r = await geocodificarEnderecos(['A', 'B'])
    expect(r).toEqual([null, null])
    expect(errorSpy.mock.calls.some(args =>
      String(args[0]).includes('geocodificação falhou para 100% do lote'),
    )).toBe(true)
  })

  it('lote de um unico endereco que falha NAO dispara o aviso de lote (sinal fraco demais)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'))
    await geocodificarEnderecos(['A'])
    expect(errorSpy.mock.calls.some(args =>
      String(args[0]).includes('geocodificação falhou para 100% do lote'),
    )).toBe(false)
  })

  it('lote com falha parcial NAO dispara o aviso de lote (nao e 100%)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ lat: -22.8, lng: -43.2 }, null] }), { status: 200 }),
    )
    await geocodificarEnderecos(['A', 'B'])
    expect(errorSpy.mock.calls.some(args =>
      String(args[0]).includes('geocodificação falhou para 100% do lote'),
    )).toBe(false)
  })

  it('mais de 300 enderecos particiona em lotes sequenciais e concatena os resultados na ordem certa', async () => {
    const enderecos = Array.from({ length: 620 }, (_, i) => `Endereco ${i}`)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as { enderecos: string[] }
      const resultados = body.enderecos.map((_, i) => ({ lat: i, lng: i }))
      return new Response(JSON.stringify({ resultados }), { status: 200 })
    })

    const r = await geocodificarEnderecos(enderecos)

    // 620 enderecos / 300 por lote = 3 chamadas (300 + 300 + 20).
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    const tamanhos = fetchSpy.mock.calls.map(([, init]) =>
      (JSON.parse((init as RequestInit).body as string) as { enderecos: string[] }).enderecos.length,
    )
    expect(tamanhos).toEqual([300, 300, 20])
    expect(r).toHaveLength(620)
    // Cada lote responde lat/lng = indice DENTRO do proprio lote -- resultado
    // final tem que remontar na ordem original, nao ficar embaralhado por lote.
    expect(r[0]).toEqual({ lat: 0, lng: 0 })
    expect(r[300]).toEqual({ lat: 0, lng: 0 }) // primeiro item do 2o lote
    expect(r[619]).toEqual({ lat: 19, lng: 19 }) // ultimo item do 3o lote (20 itens, indice 19)
  })

  it('exatamente 300 enderecos faz UMA chamada so (nao particiona sem necessidade)', async () => {
    const enderecos = Array.from({ length: 300 }, (_, i) => `Endereco ${i}`)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: enderecos.map(() => ({ lat: 1, lng: 2 })) }), { status: 200 }),
    )
    await geocodificarEnderecos(enderecos)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('um lote falhar no meio nao derruba os outros lotes -- fail-open por lote', async () => {
    const enderecos = Array.from({ length: 620 }, (_, i) => `Endereco ${i}`)
    let chamada = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      chamada += 1
      const body = JSON.parse((init as RequestInit).body as string) as { enderecos: string[] }
      if (chamada === 2) throw new Error('timeout no segundo lote')
      return new Response(JSON.stringify({ resultados: body.enderecos.map(() => ({ lat: 1, lng: 2 })) }), { status: 200 })
    })

    const r = await geocodificarEnderecos(enderecos)
    expect(r).toHaveLength(620)
    expect(r.slice(0, 300).every(x => x !== null)).toBe(true)
    expect(r.slice(300, 600).every(x => x === null)).toBe(true) // lote 2, falhou
    expect(r.slice(600, 620).every(x => x !== null)).toBe(true)
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
