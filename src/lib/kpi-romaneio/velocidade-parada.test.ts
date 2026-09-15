import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { consultarVelocidadeNaParada, type ConsultaVelocidadeParada } from './velocidade-parada'

const consultaExemplo: ConsultaVelocidadeParada = {
  placa: 'RQV6I51',
  lat: -22.5,
  lng: -43.1,
  raioM: 150,
  inicioIso: '2026-09-11T10:00:00.000Z',
  fimIso: '2026-09-11T10:20:00.000Z',
}

beforeEach(() => {
  process.env.MOTOR_SECRET = 'segredo-teste'
  process.env.MONITORAMENTO_URL = 'http://127.0.0.1:3010'
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.MOTOR_SECRET
  delete process.env.MONITORAMENTO_URL
})

describe('consultarVelocidadeNaParada', () => {
  it('lista vazia nao chama fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await consultarVelocidadeNaParada([])).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('parada real: temParadaComVelocidade e temCobertura true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ temParadaComVelocidade: true, temCobertura: true }] }), { status: 200 }),
    )
    const r = await consultarVelocidadeNaParada([consultaExemplo])
    expect(r).toEqual([{ temParadaComVelocidade: true, temCobertura: true }])
  })

  it('coberto mas em movimento: contradicao real (temCobertura true, temParadaComVelocidade false)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ temParadaComVelocidade: false, temCobertura: true }] }), { status: 200 }),
    )
    const r = await consultarVelocidadeNaParada([consultaExemplo])
    expect(r).toEqual([{ temParadaComVelocidade: false, temCobertura: true }])
  })

  it('sem cobertura de GPS na janela: os dois false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ temParadaComVelocidade: false, temCobertura: false }] }), { status: 200 }),
    )
    const r = await consultarVelocidadeNaParada([consultaExemplo])
    expect(r).toEqual([{ temParadaComVelocidade: false, temCobertura: false }])
  })

  it('envia o body em lote (uma unica chamada HTTP com todas as consultas)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ temParadaComVelocidade: true, temCobertura: true }, { temParadaComVelocidade: false, temCobertura: true }] }), { status: 200 }),
    )
    const outra = { ...consultaExemplo, placa: 'TUI1A90' }
    await consultarVelocidadeNaParada([consultaExemplo, outra])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, init] = fetchSpy.mock.calls[0]
    expect(JSON.parse(init!.body as string)).toEqual({ consultas: [consultaExemplo, outra] })
    expect((init!.headers as Record<string, string>)['x-motor-key']).toBe('segredo-teste')
  })

  it('entrada malformada na resposta vira null nessa posicao, sem derrubar as outras', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resultados: [{ temParadaComVelocidade: true, temCobertura: true }, null] }), { status: 200 }),
    )
    const r = await consultarVelocidadeNaParada([consultaExemplo, { ...consultaExemplo, placa: 'X' }])
    expect(r).toEqual([{ temParadaComVelocidade: true, temCobertura: true }, null])
  })

  it('MOTOR_SECRET ausente: fail-open (array de nulls do tamanho pedido), audivel via console.error', async () => {
    delete process.env.MOTOR_SECRET
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await consultarVelocidadeNaParada([consultaExemplo])
    expect(r).toEqual([null])
    expect(errSpy).toHaveBeenCalled()
  })

  it('falha de rede: fail-open audivel, nunca lanca', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await consultarVelocidadeNaParada([consultaExemplo])
    expect(r).toEqual([null])
    expect(errSpy).toHaveBeenCalled()
  })

  it('HTTP nao-2xx: fail-open audivel', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('erro', { status: 500 }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await consultarVelocidadeNaParada([consultaExemplo])
    expect(r).toEqual([null])
    expect(errSpy).toHaveBeenCalled()
  })

  it('JSON invalido: fail-open audivel', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nao e json', { status: 200 }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await consultarVelocidadeNaParada([consultaExemplo])
    expect(r).toEqual([null])
    expect(errSpy).toHaveBeenCalled()
  })

  it('resposta sem campo resultados valido: fail-open audivel', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await consultarVelocidadeNaParada([consultaExemplo])
    expect(r).toEqual([null])
    expect(errSpy).toHaveBeenCalled()
  })
})
