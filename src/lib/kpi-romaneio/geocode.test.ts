import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))

import { createServiceClient } from '@/lib/supabase/service'
import { geocodificarEnderecos, geocodificarEnderecosComInfo, TETO_BUSCAS_SIMILARIDADE_POR_GERACAO, separarCep, chaveCacheEndereco, escolherLinhaCache } from './geocode'

// Achado 12/09: ResultadoGeocode ganhou `fonte`/`confiavel` (ver migration
// 20260912000000). Os testes abaixo se importam com lat/lng -- normaliza pra
// comparar so' isso, em vez de reescrever toda assercao a cada campo novo.
function semExtras(rs: ({ lat: number; lng: number } | null)[]) {
  return rs.map(r => (r === null ? null : { lat: r.lat, lng: r.lng }))
}


/** Builder de um mock minimo do client Supabase pros testes de cache:
 *  `.from('kpi_romaneio_geocode_cache').select(...).in(...)` (leitura) e
 *  `.from('kpi_romaneio_geocode_cache').upsert(...)` (escrita). */
function mockSupabaseCache(opts: {
  linhasNoCache?: Array<{ endereco: string; lat: number; lng: number }>
  erroLeitura?: { message: string }
  erroEscrita?: { message: string }
}) {
  const inMock = vi.fn().mockResolvedValue(
    opts.erroLeitura
      ? { data: null, error: opts.erroLeitura }
      : { data: opts.linhasNoCache ?? [], error: null },
  )
  const selectMock = vi.fn().mockReturnValue({ in: inMock })
  const upsertMock = vi.fn().mockResolvedValue({ error: opts.erroEscrita ?? null })
  const fromMock = vi.fn().mockReturnValue({ select: selectMock, in: inMock, upsert: upsertMock })
  vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as any)
  return { fromMock, selectMock, inMock, upsertMock }
}

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
    expect(semExtras(r)).toEqual([{ lat: -22.8, lng: -43.2 }, { lat: -21.7, lng: -41.3 }])
  })

  it('um endereco falha no meio -- fail-open, nao derruba os outros', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ resultados: [{ lat: -22.8, lng: -43.2 }, null, { lat: -21.7, lng: -41.3 }] }),
        { status: 200 }
      )
    )
    const r = await geocodificarEnderecos(['A', 'B', 'C'])
    expect(semExtras(r)).toEqual([{ lat: -22.8, lng: -43.2 }, null, { lat: -21.7, lng: -41.3 }])
  })

  it('entrada malformada num item nao derruba os demais', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ resultados: [{ lat: -22.8, lng: -43.2 }, { lat: 'nao-e-numero' }, { lat: -21.7, lng: -41.3 }] }),
        { status: 200 }
      )
    )
    const r = await geocodificarEnderecos(['A', 'B', 'C'])
    expect(semExtras(r)).toEqual([{ lat: -22.8, lng: -43.2 }, null, { lat: -21.7, lng: -41.3 }])
  })

  it('timeout/erro de rede na chamada inteira nao lanca -- devolve tudo null', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'))
    const r = await geocodificarEnderecos(['A', 'B', 'C'])
    expect(semExtras(r)).toEqual([null, null, null])
  })

  it('resposta HTTP de erro nao lanca -- devolve tudo null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    const r = await geocodificarEnderecos(['A', 'B'])
    expect(semExtras(r)).toEqual([null, null])
  })

  it('JSON invalido na resposta nao lanca -- devolve tudo null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nao e json', { status: 200 }))
    const r = await geocodificarEnderecos(['A'])
    expect(semExtras(r)).toEqual([null])
  })

  it("resposta sem campo 'resultados' valido nao lanca -- devolve tudo null", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const r = await geocodificarEnderecos(['A', 'B'])
    expect(semExtras(r)).toEqual([null, null])
  })

  it('resposta menor que o pedido nao lanca nem desalinha -- preenche o resto com null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ lat: -22.8, lng: -43.2 }] }), { status: 200 })
    )
    const r = await geocodificarEnderecos(['A', 'B', 'C'])
    expect(semExtras(r)).toEqual([{ lat: -22.8, lng: -43.2 }, null, null])
  })

  it('MOTOR_SECRET ausente nao chama fetch e devolve tudo null', async () => {
    delete process.env.MOTOR_SECRET
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await geocodificarEnderecos(['A', 'B'])
    expect(semExtras(r)).toEqual([null, null])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('lote com mais de um endereco 100% null (erro de rede) loga aviso explicito', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await geocodificarEnderecos(['A', 'B'])
    expect(semExtras(r)).toEqual([null, null])
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
    expect(semExtras(r)).toEqual([null, null])
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

  it('mais de um lote particiona em lotes sequenciais e concatena os resultados na ordem certa', async () => {
    const enderecos = Array.from({ length: 90 }, (_, i) => `Endereco ${i}`)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as { enderecos: string[] }
      const resultados = body.enderecos.map((_, i) => ({ lat: i, lng: i }))
      return new Response(JSON.stringify({ resultados }), { status: 200 })
    })

    const r = await geocodificarEnderecos(enderecos)

    // 90 enderecos / 15 por lote = 6 chamadas.
    expect(fetchSpy).toHaveBeenCalledTimes(6)
    const tamanhos = fetchSpy.mock.calls.map(([, init]) =>
      (JSON.parse((init as RequestInit).body as string) as { enderecos: string[] }).enderecos.length,
    )
    expect(tamanhos).toEqual([15, 15, 15, 15, 15, 15])
    expect(r).toHaveLength(90)
    // Cada lote responde lat/lng = indice DENTRO do proprio lote -- resultado
    // final tem que remontar na ordem original, nao ficar embaralhado por lote.
    expect(r[0]).toMatchObject({ lat: 0, lng: 0 })
    expect(r[15]).toMatchObject({ lat: 0, lng: 0 }) // primeiro item do 2o lote
    expect(r[89]).toMatchObject({ lat: 14, lng: 14 }) // ultimo item do 6o lote
  })

  it('exatamente um lote cheio faz UMA chamada so (nao particiona sem necessidade)', async () => {
    const enderecos = Array.from({ length: 15 }, (_, i) => `Endereco ${i}`)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: enderecos.map(() => ({ lat: 1, lng: 2 })) }), { status: 200 }),
    )
    await geocodificarEnderecos(enderecos)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('um lote falhar no meio nao derruba os outros lotes -- fail-open por lote', async () => {
    const enderecos = Array.from({ length: 90 }, (_, i) => `Endereco ${i}`)
    let chamada = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      chamada += 1
      const body = JSON.parse((init as RequestInit).body as string) as { enderecos: string[] }
      if (chamada === 2) throw new Error('timeout no segundo lote')
      return new Response(JSON.stringify({ resultados: body.enderecos.map(() => ({ lat: 1, lng: 2 })) }), { status: 200 })
    })

    const r = await geocodificarEnderecos(enderecos)
    expect(r).toHaveLength(90)
    expect(r.slice(0, 15).every(x => x !== null)).toBe(true)
    expect(r.slice(15, 30).every(x => x === null)).toBe(true) // lote 2, falhou
    expect(r.slice(30, 90).every(x => x !== null)).toBe(true)
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

/** Mock por tabela: positivo (select.in) e negativo (select.in.gt), com upserts separados. */
function mockSupabaseTabelas(opts: {
  positivo?: Array<{ endereco: string; lat: number; lng: number; fonte?: string }>
  negativo?: string[]
  erroNegativo?: boolean
}) {
  const upsertPositivo = vi.fn().mockResolvedValue({ error: null })
  const upsertNegativo = vi.fn().mockResolvedValue({ error: null })
  const gtMock = vi.fn()
  const negativoDoLote = (lote: string[]) => (..._args: unknown[]) => {
    gtMock(..._args)
    return Promise.resolve(
      opts.erroNegativo
        ? { data: null, error: { message: 'negativo indisponivel' } }
        : { data: (opts.negativo ?? []).filter(e => lote.includes(e)).map(endereco => ({ endereco })), error: null },
    )
  }
  const fromMock = vi.fn().mockImplementation((tabela: string) => {
    if (tabela === 'kpi_romaneio_geocode_negativo') {
      return { select: () => ({ in: (_c: string, lote: string[]) => ({ gt: negativoDoLote(lote) }) }), upsert: upsertNegativo }
    }
    return {
      select: () => ({
        in: (_c: string, lote: string[]) =>
          Promise.resolve({ data: (opts.positivo ?? []).filter(l => lote.includes(l.endereco)), error: null }),
      }),
      upsert: upsertPositivo,
    }
  })
  vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as any)
  return { fromMock, upsertPositivo, upsertNegativo, gtMock }
}

const respostaOk = (resultados: unknown[]) => new Response(JSON.stringify({ resultados }), { status: 200 })

describe('geocodificarEnderecos - cache negativo e gravacao por lote', () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockClear()
  })

  it('null numa resposta 200 grava no negativo e NAO no cache positivo', async () => {
    const { upsertNegativo, upsertPositivo } = mockSupabaseTabelas({})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaOk([{ lat: 1, lng: 2 }, null]))

    await geocodificarEnderecos(['Rua Ok', 'Sitio Perdido'])

    expect(upsertNegativo).toHaveBeenCalledTimes(1)
    const linhas = upsertNegativo.mock.calls[0][0] as Array<{ endereco: string }>
    expect(linhas.map(l => l.endereco)).toEqual(['Sitio Perdido'])
    expect(upsertNegativo.mock.calls[0][1]).toEqual({ onConflict: 'endereco' })
    const positivos = upsertPositivo.mock.calls.flatMap(c => (c[0] as Array<{ endereco: string }>).map(l => l.endereco))
    expect(positivos).not.toContain('Sitio Perdido')
  })

  it('falha de transporte (fetch rejeita) nao grava no negativo', async () => {
    const { upsertNegativo } = mockSupabaseTabelas({})
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    await geocodificarEnderecos(['A', 'B'])
    expect(upsertNegativo).not.toHaveBeenCalled()
  })

  it('HTTP 500 nao grava no negativo', async () => {
    const { upsertNegativo } = mockSupabaseTabelas({})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    await geocodificarEnderecos(['A', 'B'])
    expect(upsertNegativo).not.toHaveBeenCalled()
  })

  it('JSON invalido nao grava no negativo', async () => {
    const { upsertNegativo } = mockSupabaseTabelas({})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nao e json', { status: 200 }))
    await geocodificarEnderecos(['A', 'B'])
    expect(upsertNegativo).not.toHaveBeenCalled()
  })

  it("resposta sem 'resultados' nao grava no negativo", async () => {
    const { upsertNegativo } = mockSupabaseTabelas({})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await geocodificarEnderecos(['A', 'B'])
    expect(upsertNegativo).not.toHaveBeenCalled()
  })

  it('MOTOR_SECRET ausente nao grava no negativo', async () => {
    delete process.env.MOTOR_SECRET
    const { upsertNegativo } = mockSupabaseTabelas({})
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await geocodificarEnderecos(['A', 'B'])
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(upsertNegativo).not.toHaveBeenCalled()
  })

  it('endereco no negativo recente nao vai pra ponte e devolve null; os demais seguem', async () => {
    mockSupabaseTabelas({ negativo: ['Sitio Perdido'] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaOk([{ lat: 5, lng: 6 }]))

    const r = await geocodificarEnderecos(['Sitio Perdido', 'Rua Nova'])

    expect(semExtras(r)).toEqual([null, { lat: 5, lng: 6 }])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)).toEqual({ enderecos: ['Rua Nova'] })
  })

  it('positivo vence o negativo', async () => {
    mockSupabaseTabelas({ positivo: [{ endereco: 'Rua A', lat: -22.8, lng: -43.2 }], negativo: ['Rua A'] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await geocodificarEnderecos(['Rua A'])
    expect(semExtras(r)).toEqual([{ lat: -22.8, lng: -43.2 }])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('erro ao ler o negativo e fail-open: chama a ponte pra todos', async () => {
    mockSupabaseTabelas({ erroNegativo: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaOk([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]))
    const r = await geocodificarEnderecos(['A', 'B'])
    expect(semExtras(r)).toEqual([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }])
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)).toEqual({ enderecos: ['A', 'B'] })
  })

  it('negativo usa limite de 48h na leitura', async () => {
    const { gtMock } = mockSupabaseTabelas({})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaOk([null]))
    const antes = Date.now()
    await geocodificarEnderecos(['A'])
    const [col, limite] = gtMock.mock.calls[0]
    expect(col).toBe('tentado_em')
    const dif = antes - new Date(limite as string).getTime()
    expect(Math.abs(dif - 48 * 3600_000)).toBeLessThan(5000)
  })

  it('resposta curta (1 item pra 2 enderecos) nao certifica: nada vai pro negativo', async () => {
    const { upsertNegativo } = mockSupabaseTabelas({})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaOk([{ lat: 1, lng: 2 }]))
    const r = await geocodificarEnderecos(['A', 'B'])
    expect(semExtras(r)).toEqual([{ lat: 1, lng: 2 }, null])
    expect(upsertNegativo).not.toHaveBeenCalled()
  })

  it('lote de 3 100% null em resposta 200 e suspeito: nao grava no negativo', async () => {
    const { upsertNegativo } = mockSupabaseTabelas({})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaOk([null, null, null]))
    await geocodificarEnderecos(['A', 'B', 'C'])
    expect(upsertNegativo).not.toHaveBeenCalled()
  })

  it('lote de 1 endereco null em resposta 200 grava no negativo', async () => {
    const { upsertNegativo } = mockSupabaseTabelas({})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaOk([null]))
    await geocodificarEnderecos(['Sitio Perdido'])
    expect((upsertNegativo.mock.calls[0][0] as Array<{ endereco: string }>).map(l => l.endereco)).toEqual(['Sitio Perdido'])
  })

  it('lote misto grava no negativo so os nulls', async () => {
    const { upsertNegativo } = mockSupabaseTabelas({})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaOk([{ lat: 1, lng: 2 }, null, { lat: 3, lng: 4 }, null]))
    await geocodificarEnderecos(['A', 'B', 'C', 'D'])
    expect((upsertNegativo.mock.calls[0][0] as Array<{ endereco: string }>).map(l => l.endereco)).toEqual(['B', 'D'])
  })

  it('grava o positivo de cada lote antes de chamar o proximo (2o lote falha por transporte)', async () => {
    const { upsertPositivo, upsertNegativo } = mockSupabaseTabelas({})
    const ordem: string[] = []
    upsertPositivo.mockImplementation(async () => { ordem.push('upsert'); return { error: null } })
    let chamada = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      chamada += 1
      ordem.push(`fetch${chamada}`)
      if (chamada === 2) throw new Error('timeout')
      const body = JSON.parse((init as RequestInit).body as string) as { enderecos: string[] }
      return respostaOk(body.enderecos.map(() => ({ lat: 1, lng: 2 })))
    })
    const enderecos = Array.from({ length: 30 }, (_, i) => `Endereco ${i}`)

    await geocodificarEnderecos(enderecos)

    expect(ordem.slice(0, 3)).toEqual(['fetch1', 'upsert', 'fetch2'])
    expect(upsertPositivo).toHaveBeenCalledTimes(1)
    expect(upsertNegativo).not.toHaveBeenCalled()
  })
})

describe('geocodificarEnderecos - cache proprio', () => {
  it('endereco ja no cache nao chama a ponte HTTP', async () => {
    mockSupabaseCache({ linhasNoCache: [{ endereco: 'Rua A', lat: -22.8, lng: -43.2 }] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const r = await geocodificarEnderecos(['Rua A'])

    expect(semExtras(r)).toEqual([{ lat: -22.8, lng: -43.2 }])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('endereco novo chama a ponte e depois grava no cache', async () => {
    const { upsertMock } = mockSupabaseCache({ linhasNoCache: [] })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ lat: 1, lng: 2 }] }), { status: 200 }),
    )

    const r = await geocodificarEnderecos(['Rua Nova'])

    expect(semExtras(r)).toEqual([{ lat: 1, lng: 2 }])
    expect(upsertMock).toHaveBeenCalledWith(
      [expect.objectContaining({ endereco: 'Rua Nova', lat: 1, lng: 2 })],
      { onConflict: 'endereco' },
    )
  })

  it('endereco que nao geocodificou (null) NAO entra no upsert', async () => {
    const { upsertMock } = mockSupabaseCache({ linhasNoCache: [] })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ lat: 1, lng: 2 }, null] }), { status: 200 }),
    )

    await geocodificarEnderecos(['Rua Ok', 'Rua Falhou'])

    expect(upsertMock).toHaveBeenCalledWith(
      [expect.objectContaining({ endereco: 'Rua Ok', lat: 1, lng: 2 })],
      { onConflict: 'endereco' },
    )
  })

  it('mistura de endereco no cache com endereco novo -- so o novo vai pra ponte, resultado remonta na ordem certa', async () => {
    mockSupabaseCache({ linhasNoCache: [{ endereco: 'Rua Velha', lat: -22.8, lng: -43.2 }] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ lat: 5, lng: 6 }] }), { status: 200 }),
    )

    const r = await geocodificarEnderecos(['Rua Velha', 'Rua Nova'])

    expect(semExtras(r)).toEqual([{ lat: -22.8, lng: -43.2 }, { lat: 5, lng: 6 }])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)).toEqual({ enderecos: ['Rua Nova'] })
  })

  it('leitura do cache falhando nao trava -- segue fail-open pro caminho normal (chama a ponte)', async () => {
    mockSupabaseCache({ erroLeitura: { message: 'conexao recusada' } })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ lat: 1, lng: 2 }] }), { status: 200 }),
    )

    const r = await geocodificarEnderecos(['Rua A'])

    expect(semExtras(r)).toEqual([{ lat: 1, lng: 2 }])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('escrita no cache falhando nao muda o resultado ja calculado', async () => {
    mockSupabaseCache({ linhasNoCache: [], erroEscrita: { message: 'tabela travada' } })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ lat: 1, lng: 2 }] }), { status: 200 }),
    )

    const r = await geocodificarEnderecos(['Rua A'])

    expect(semExtras(r)).toEqual([{ lat: 1, lng: 2 }])
  })

  it('mais de 20 enderecos particiona a leitura do cache em varias chamadas .in()', async () => {
    const enderecos = Array.from({ length: 45 }, (_, i) => `Endereco ${i}`)
    const inMock = vi.fn().mockImplementation((_col: string, valores: string[]) =>
      Promise.resolve({ data: valores.map(e => ({ endereco: e, lat: 1, lng: 2 })), error: null }),
    )
    const selectMock = vi.fn().mockReturnValue({ in: inMock })
    const fromMock = vi.fn().mockReturnValue({ select: selectMock, upsert: vi.fn() })
    vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as any)

    const r = await geocodificarEnderecos(enderecos)

    // 45 enderecos / 20 por lote de leitura = 3 chamadas (20 + 20 + 5).
    expect(inMock).toHaveBeenCalledTimes(3)
    expect(inMock.mock.calls.map(([, valores]) => (valores as string[]).length)).toEqual([20, 20, 5])
    expect(r).toHaveLength(45)
    expect(r.every(x => x !== null)).toBe(true)
  })

  it('todos os enderecos ja no cache nunca cria o client de novo pra escrever (nada pra salvar)', async () => {
    const { upsertMock } = mockSupabaseCache({ linhasNoCache: [{ endereco: 'Rua A', lat: 1, lng: 2 }] })
    await geocodificarEnderecos(['Rua A'])
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

// Incidente 01/10 (CPU 100% no Postgres por buscas de similaridade CNEFE
// simultaneas -- ver src/lib/cnefe-similaridade-limitada.ts no monitoramento):
// a ponte devolve `incompletos` (endereco sem resultado porque a busca por
// similaridade estourou o timeout ou foi pulada) e `buscasSimilaridade`.
describe('geocodificarEnderecos - geocode parcial (busca por similaridade limitada)', () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockClear()
  })

  const respostaPonte = (resultados: unknown[], extras: Record<string, unknown>) =>
    new Response(JSON.stringify({ resultados, ...extras }), { status: 200 })

  it('endereco em `incompletos` (timeout na similaridade) NAO grava cache negativo; os outros nulls gravam', async () => {
    const { upsertNegativo } = mockSupabaseTabelas({})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaPonte([{ lat: 1, lng: 2 }, null, null], { incompletos: [1], buscasSimilaridade: 3 }))
    await geocodificarEnderecos(['A', 'Timeout', 'Sitio Perdido'])
    expect(upsertNegativo).toHaveBeenCalledTimes(1)
    expect((upsertNegativo.mock.calls[0][0] as Array<{ endereco: string }>).map(l => l.endereco)).toEqual(['Sitio Perdido'])
  })

  it('resultado identico quando nada estoura (sem incompletos): mesmo retorno e mesmo negativo de antes', async () => {
    const { upsertNegativo } = mockSupabaseTabelas({})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaPonte([{ lat: 1, lng: 2 }, null], { incompletos: [], buscasSimilaridade: 2 }))
    const { resultados, parciais } = await geocodificarEnderecosComInfo(['A', 'B'])
    expect(semExtras(resultados)).toEqual([{ lat: 1, lng: 2 }, null])
    expect(parciais).toBe(0)
    expect((upsertNegativo.mock.calls[0][0] as Array<{ endereco: string }>).map(l => l.endereco)).toEqual(['B'])
  })

  it('conta os parciais e avisa "geocode parcial -- gere novamente"', async () => {
    mockSupabaseTabelas({})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaPonte([null, null, { lat: 1, lng: 2 }], { incompletos: [0, 1], buscasSimilaridade: 3 }))
    const { parciais } = await geocodificarEnderecosComInfo(['A', 'B', 'C'])
    expect(parciais).toBe(2)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('geocode parcial'))
  })

  it('teto por geracao: atingido o teto de buscas por similaridade somadas, os proximos lotes vao com semSimilaridade', async () => {
    expect(TETO_BUSCAS_SIMILARIDADE_POR_GERACAO).toBe(600)
    mockSupabaseTabelas({})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const corpos: Array<Record<string, unknown>> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as { enderecos: string[] }
      corpos.push(body)
      // cada lote "gasta" metade do teto
      return respostaPonte(body.enderecos.map(() => ({ lat: 1, lng: 2 })), { incompletos: [], buscasSimilaridade: TETO_BUSCAS_SIMILARIDADE_POR_GERACAO / 2 })
    })
    await geocodificarEnderecos(Array.from({ length: 60 }, (_, i) => `E${i}`), { validarTerritorio: true })
    expect(corpos.map(c => c.semSimilaridade === true)).toEqual([false, false, true, true])
    expect(corpos.every(c => c.validarTerritorio === true)).toBe(true)
  })
})

// Reprocessamento do cache antigo sem fonte (scripts/reprocessar-cache-rq.ts,
// relatorio 01/10): precisa da cascata ATUAL sem passar pelo cache (o cache e'
// justamente o que se quer revalidar) e sem gravar nada.
import { geocodificarSemCache } from './geocode'
describe('geocodificarSemCache', () => {
  it('chama a ponte com validarTerritorio, nunca le nem grava o cache', async () => {
    const { fromMock } = mockSupabaseCache({ linhasNoCache: [{ endereco: 'RUA A, - B, RIO DE JANEIRO - RJ', lat: -22.86, lng: -43.24 }] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ lat: -22.90, lng: -43.56, fonte: 'cnefe', validado: true }] }), { status: 200 }),
    )
    const r = await geocodificarSemCache(['RUA A, - B, RIO DE JANEIRO - RJ'], { validarTerritorio: true })
    expect(r).toEqual([{ lat: -22.90, lng: -43.56, fonte: 'cnefe', confiavel: true, motivo: undefined }])
    expect(JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))).toMatchObject({ validarTerritorio: true })
    expect(fromMock).not.toHaveBeenCalled()
  })
})

// Regressao 01/10/2026: o Romaneio de Entrega da Nutry Max passou a trazer o
// CEP no fim do endereco (" - 28300000", " - 28180-000", " - 2895-0000").
// A chave do cache era o endereco bruto: 1.883 linhas novas no cache e 218
// enderecos perderam a coordenada ja' aprendida (60 curadas a mao). Linhas
// abaixo sao do PDF real de 01/10 (nutrimax/2026-10-01/b51b33ae...).
describe('separarCep / chaveCacheEndereco', () => {
  it.each([
    ['RUA ANTONIO CUNHA, 502 - FRIGORIFICO, ITAPERUNA - ** - 28300000', 'RUA ANTONIO CUNHA, 502 - FRIGORIFICO, ITAPERUNA - **', '28300000'],
    ['R JOSE MIRANDA, 101 - CATARINO, CARDOSO MOREIRA - LOJA C LOJA D - 28180-000', 'R JOSE MIRANDA, 101 - CATARINO, CARDOSO MOREIRA - LOJA C LOJA D', '28180-000'],
    ['AV JOSE BENTO RIBEIRO DANTAS, 534 - CENTRO, ARMACAO DOS BUZ - B - 2895-0000', 'AV JOSE BENTO RIBEIRO DANTAS, 534 - CENTRO, ARMACAO DOS BUZ - B', '2895-0000'],
    ['RUA OLIVIA FARIA, 29 - CENTRO, ITALVA - * - 28250000', 'RUA OLIVIA FARIA, 29 - CENTRO, ITALVA - *', '28250000'],
    ['RUA X, 10 - CENTRO, ITALVA, 28250000', 'RUA X, 10 - CENTRO, ITALVA', '28250000'],
    ['RUA X, 10 - CENTRO, ITALVA - *  -  28250000 ', 'RUA X, 10 - CENTRO, ITALVA - *', '28250000'],
  ])('tira o sufixo de CEP: %s', (bruto, chave, cep) => {
    expect(separarCep(bruto)).toEqual({ chave, cep })
    expect(chaveCacheEndereco(bruto)).toBe(chave)
  })

  it.each([
    'RUA OLIVIA FARIA, 29 - CENTRO, ITALVA - *',
    // complemento numerico curto do formato antigo (30/09) -- numero de loja/sala, nao CEP
    'RUA  SEVERINO COUTINHO, 329 - PARQUE PRAZERES, CAMPOS DOS GOYT - 331',
    'AVENIDA ABILIO AUGUSTO TAVORA, 1111 - DA LUZ, NOVA IGUACU - 4044',
    // 8 digitos sem separador antes (lote/PLT) nao e' sufixo de CEP
    'ESTRADA DA BOCA DO MATO, S/N - VARGEM PEQUENA, RIO DE JANEIRO - PLT 50623227',
    'AV CARLOS MARIGHELLA, 3989 - CHACARAS DE INOA, MARICA - LOJA 02 QUADRA0015 LOTE 0000000001',
    'ALM JOAO LUIZ ALVES, S/N - URCA, RIO DE JANEIRO - -',
    'AV. SAQUAREMA, - BACAXA, SAQUAREMA - RJ',
    // sobraria so' a rua (sem " - bairro") -- nao arrisca cortar
    'AV BRASIL, 21941570',
  ])('endereco sem sufixo de CEP fica identico: %s', bruto => {
    expect(separarCep(bruto)).toEqual({ chave: bruto, cep: null })
    expect(chaveCacheEndereco(bruto)).toBe(bruto)
  })
})

describe('geocodificarEnderecos - chave do cache sem o sufixo de CEP', () => {
  const SEM = 'RUA ANTONIO CUNHA, 502 - FRIGORIFICO, ITAPERUNA - **'
  const COM = `${SEM} - 28300000`

  it('endereco com CEP casa a linha antiga sem CEP: usa a coordenada aprendida, sem chamar a ponte', async () => {
    mockSupabaseTabelas({ positivo: [{ endereco: SEM, lat: -21.2, lng: -41.9, fonte: 'verificacao_manual' }] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await geocodificarEnderecos([COM])
    expect(r).toEqual([expect.objectContaining({ lat: -21.2, lng: -41.9, fonte: 'verificacao_manual' })])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('linha com CEP (gravada em 01/10) e linha antiga sem CEP: a antiga vence', async () => {
    mockSupabaseTabelas({ positivo: [
      { endereco: COM, lat: -21.0, lng: -41.0, fonte: 'cnefe' },
      { endereco: SEM, lat: -21.2, lng: -41.9, fonte: 'cnefe' },
    ] })
    const r = await geocodificarEnderecos([COM])
    expect(semExtras(r)).toEqual([{ lat: -21.2, lng: -41.9 }])
  })

  it.each([
    ['verificacao_manual', 'cnefe'],
    ['manual', 'cadastro_unitrac'],
    ['verificacao_manual', 'parada_alvo'],
  ])('correcao manual (%s) na linha com CEP vence a linha sem CEP (%s)', async (fonteCom, fonteSem) => {
    mockSupabaseTabelas({ positivo: [
      { endereco: COM, lat: -21.0, lng: -41.0, fonte: fonteCom },
      { endereco: SEM, lat: -21.2, lng: -41.9, fonte: fonteSem },
    ] })
    const r = await geocodificarEnderecos([COM])
    expect(semExtras(r)).toEqual([{ lat: -21.0, lng: -41.0 }])
  })

  it('linha com CEP so' + "'" + ' existe ela (manual de 01/10, ex. VASSOURAS): continua sendo usada', async () => {
    mockSupabaseTabelas({ positivo: [{ endereco: COM, lat: -21.0, lng: -41.0, fonte: 'verificacao_manual' }] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await geocodificarEnderecos([COM])
    expect(semExtras(r)).toEqual([{ lat: -21.0, lng: -41.0 }])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('endereco novo com CEP: a ponte recebe o texto sem CEP e o cache grava a chave sem CEP', async () => {
    const { upsertPositivo } = mockSupabaseTabelas({})
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaOk([{ lat: 1, lng: 2 }]))
    const r = await geocodificarEnderecos([COM])
    expect(semExtras(r)).toEqual([{ lat: 1, lng: 2 }])
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).toEqual({ enderecos: [SEM] })
    const gravados = upsertPositivo.mock.calls.flatMap(c => (c[0] as Array<{ endereco: string }>).map(l => l.endereco))
    expect(gravados).toEqual([SEM])
  })

  it('mesmo endereco com e sem CEP no mesmo dia: UMA busca na ponte, os dois recebem o resultado', async () => {
    mockSupabaseTabelas({})
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaOk([{ lat: 1, lng: 2 }]))
    const r = await geocodificarEnderecos([COM, SEM, `${SEM} - 28300-000`])
    expect(semExtras(r)).toEqual([{ lat: 1, lng: 2 }, { lat: 1, lng: 2 }, { lat: 1, lng: 2 }])
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).toEqual({ enderecos: [SEM] })
  })

  it('cache negativo le pela chave sem CEP', async () => {
    mockSupabaseTabelas({ negativo: [SEM] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await geocodificarEnderecos([COM])).toEqual([null])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('cache negativo grava a chave sem CEP', async () => {
    const outroSem = 'SITIO PERDIDO, S/N - ZONA RURAL, ITALVA - *'
    const { upsertNegativo } = mockSupabaseTabelas({})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaOk([null]))
    await geocodificarEnderecos([`${outroSem} - 28250000`])
    expect((upsertNegativo.mock.calls[0][0] as Array<{ endereco: string }>).map(l => l.endereco)).toEqual([outroSem])
  })

  it('endereco antigo sem CEP: mesma chave de sempre', async () => {
    const { upsertPositivo } = mockSupabaseTabelas({})
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaOk([{ lat: 1, lng: 2 }]))
    await geocodificarEnderecos([SEM])
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).toEqual({ enderecos: [SEM] })
    expect((upsertPositivo.mock.calls[0][0] as Array<{ endereco: string }>)[0].endereco).toBe(SEM)
  })
})

describe('escolherLinhaCache', () => {
  const linha = (fonte: string | null) => ({ lat: 0, lng: 0, fonte: fonte ?? undefined, confiavel: true })
  it('so uma das duas existe: usa ela', () => {
    expect(escolherLinhaCache(linha('cnefe'), undefined)?.fonte).toBe('cnefe')
    expect(escolherLinhaCache(undefined, linha('cnefe'))?.fonte).toBe('cnefe')
    expect(escolherLinhaCache(undefined, undefined)).toBeUndefined()
  })
  it('empate entre fontes automaticas: a da chave sem CEP (aprendida antes de 01/10) vence', () => {
    expect(escolherLinhaCache({ ...linha('cnefe'), lat: 1 }, { ...linha('cnefe'), lat: 2 })?.lat).toBe(1)
    expect(escolherLinhaCache({ ...linha(null), lat: 1 }, { ...linha('cnefe_bairro'), lat: 2 })?.lat).toBe(1)
  })
  // Medicao 01/10: a linha com CEP so' existe desde 01/10 (depois do fix nada
  // mais grava chave com CEP), entao uma correcao humana / cadastro Unitrac nela
  // e' a mais NOVA -- ex. ROD BR 393 - KM 210 (VASSOURAS): verificacao_manual de
  // 04/09 na chave sem CEP e outra de 01/10 (a 400 m) na linha com CEP.
  it('empate entre correcoes (humana ou cadastro_unitrac): a linha com CEP, mais nova, vence', () => {
    expect(escolherLinhaCache({ ...linha('verificacao_manual'), lat: 1 }, { ...linha('verificacao_manual'), lat: 2 })?.lat).toBe(2)
    expect(escolherLinhaCache({ ...linha('manual'), lat: 1 }, { ...linha('verificacao_manual'), lat: 2 })?.lat).toBe(2)
    expect(escolherLinhaCache({ ...linha('cadastro_unitrac'), lat: 1 }, { ...linha('cadastro_unitrac'), lat: 2 })?.lat).toBe(2)
  })
  it('manual > cadastro_unitrac > resto', () => {
    expect(escolherLinhaCache({ ...linha('cadastro_unitrac'), lat: 1 }, { ...linha('verificacao_manual'), lat: 2 })?.lat).toBe(2)
    expect(escolherLinhaCache({ ...linha('cnefe'), lat: 1 }, { ...linha('cadastro_unitrac'), lat: 2 })?.lat).toBe(2)
    expect(escolherLinhaCache({ ...linha('cadastro_unitrac'), lat: 1 }, { ...linha('gps_dwell'), lat: 2 })?.lat).toBe(1)
  })
})
