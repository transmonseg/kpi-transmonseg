import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calcularDistanciasReais, enriquecerComKmReal, criarLimitador } from './km-ors'
import type { ResumoVeiculo, ParadaUnitrac } from '@/lib/types/unitrac'

function parada(overrides: Partial<ParadaUnitrac> = {}): ParadaUnitrac {
  return {
    placa_norm: 'TTL7D40',
    chegada: new Date('2026-07-31T10:00:00.000Z'),
    saida: new Date('2026-07-31T10:20:00.000Z'),
    duracao_seg: 1200,
    distancia_km: null,
    endereco: null,
    lat: -22.9,
    lng: -43.2,
    local_parada: '165049 - CLIENTE TESTE',
    codigo_loja: '165049',
    nome_loja: 'CLIENTE TESTE',
    classificacao: 'LOJA',
    ordem: 1,
    ...overrides,
  }
}

function resumoVeiculo(overrides: Partial<ResumoVeiculo> = {}): ResumoVeiculo {
  return {
    placa_norm: 'TTL7D40',
    placa_raw: 'TTL7D40',
    inicio_viagem: new Date('2026-07-31T08:00:00.000Z'),
    fim_viagem: new Date('2026-07-31T16:00:00.000Z'),
    qtd_paradas: 2,
    saida_cd: null,
    paradas: [
      parada({ ordem: 1 }),
      parada({ ordem: 2, lat: -22.91, lng: -43.21 }),
    ],
    ...overrides,
  }
}

function mockFetchOrs(distanciasM: number[]) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ routes: [{ segments: distanciasM.map(distance => ({ distance })) }] }),
  }))
}

describe('calcularDistanciasReais', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('retorna [] pra menos de 2 pontos', async () => {
    const out = await calcularDistanciasReais([{ lat: -22.9, lng: -43.2 }], 'fake-key')
    expect(out).toEqual([])
  })

  it('converte metros (ORS) pra km', async () => {
    global.fetch = mockFetchOrs([1500, 2500]) as unknown as typeof fetch
    const pontos = [
      { lat: -22.9, lng: -43.2 },
      { lat: -22.91, lng: -43.21 },
      { lat: -22.92, lng: -43.22 },
    ]
    const out = await calcularDistanciasReais(pontos, 'fake-key')
    expect(out).toEqual([1.5, 2.5])
  })

  it('quebra em blocos de até 50 pontos, mantendo o ponto de fronteira', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ segments: Array.from({ length: 49 }, () => ({ distance: 1000 })) }] }),
    }))
    global.fetch = fetchMock as unknown as typeof fetch

    const pontos = Array.from({ length: 99 }, (_, i) => ({ lat: -22.9 + i * 0.001, lng: -43.2 }))
    const out = await calcularDistanciasReais(pontos, 'fake-key')

    expect(fetchMock).toHaveBeenCalledTimes(2) // 99 pontos = blocos de 50 + 50 (compartilhando fronteira)
    expect(out).toHaveLength(98) // 99 pontos = 98 trechos
  })

  it('retorna null quando a API responde com erro', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    const out = await calcularDistanciasReais([{ lat: -22.9, lng: -43.2 }, { lat: -22.91, lng: -43.21 }], 'fake-key')
    expect(out).toBeNull()
  })

  it('retorna null quando fetch lança exceção (rede fora, timeout etc)', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network down') }) as unknown as typeof fetch
    const out = await calcularDistanciasReais([{ lat: -22.9, lng: -43.2 }, { lat: -22.91, lng: -43.21 }], 'fake-key')
    expect(out).toBeNull()
  })

  it('usa o limitador de taxa passado explicitamente antes de cada chamada', async () => {
    global.fetch = mockFetchOrs([1000]) as unknown as typeof fetch
    let chamou = false
    const aguardarVaga = async () => { chamou = true }
    await calcularDistanciasReais([{ lat: -22.9, lng: -43.2 }, { lat: -22.91, lng: -43.21 }], 'fake-key', aguardarVaga)
    expect(chamou).toBe(true)
  })

  it('429 mesmo respeitando o espaçador tenta 1 vez a mais antes de desistir', async () => {
    let chamadas = 0
    global.fetch = vi.fn(async () => {
      chamadas++
      if (chamadas === 1) return { ok: false, status: 429, json: async () => ({}) }
      return { ok: true, json: async () => ({ routes: [{ segments: [{ distance: 2000 }] }] }) }
    }) as unknown as typeof fetch

    let vagas = 0
    const aguardarVaga = async () => { vagas++ }
    const out = await calcularDistanciasReais([{ lat: -22.9, lng: -43.2 }, { lat: -22.91, lng: -43.21 }], 'fake-key', aguardarVaga)

    expect(chamadas).toBe(2)
    expect(vagas).toBe(2) // pediu vaga de novo antes de tentar a 2ª vez
    expect(out).toEqual([2])
  })

  it('429 duas vezes seguidas desiste (não insiste indefinidamente)', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })) as unknown as typeof fetch
    const out = await calcularDistanciasReais([{ lat: -22.9, lng: -43.2 }, { lat: -22.91, lng: -43.21 }], 'fake-key', async () => {})
    expect(out).toBeNull()
  })
})

describe('criarLimitador (intervalo mínimo fixo, sem rajada)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('a 1ª chamada não espera', async () => {
    const inicio = Date.now()
    const aguardarVaga = criarLimitador(1000, inicio + 10_000)
    await aguardarVaga()
    expect(Date.now()).toBe(inicio)
  })

  it('a 2ª chamada logo em seguida espera o intervalo inteiro — nunca libera em rajada', async () => {
    const inicio = Date.now()
    const aguardarVaga = criarLimitador(1000, inicio + 10_000)
    await aguardarVaga()

    let liberou = false
    const p = aguardarVaga().then(() => { liberou = true })

    await vi.advanceTimersByTimeAsync(999)
    expect(liberou).toBe(false)

    await vi.advanceTimersByTimeAsync(2)
    await p
    expect(liberou).toBe(true)
  })

  it('chamada que já demorou mais que o intervalo não acumula espera extra', async () => {
    const inicio = Date.now()
    const aguardarVaga = criarLimitador(1000, inicio + 10_000)
    await aguardarVaga()
    await vi.advanceTimersByTimeAsync(1500) // passou o intervalo sem pedir nova vaga
    const antes = Date.now()
    await aguardarVaga()
    expect(Date.now()).toBe(antes) // libera na hora, não "deve" o tempo ocioso
  })

  it('lança quando o prazo absoluto é ultrapassado em vez de travar pra sempre', async () => {
    const inicio = Date.now()
    const aguardarVaga = criarLimitador(1000, inicio + 500) // prazo curto
    await aguardarVaga() // 1ª chamada, dentro do prazo

    const promessa = aguardarVaga()
    const expectativa = expect(promessa).rejects.toThrow('prazo de enriquecimento ORS esgotado')
    await vi.advanceTimersByTimeAsync(600)
    await expectativa
  })
})

describe('enriquecerComKmReal', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = mockFetchOrs([3000]) as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('atribui a distância do trecho à parada de chegada, 1ª parada fica sem distancia_km', async () => {
    const out = await enriquecerComKmReal([resumoVeiculo()], 'fake-key')
    expect(out[0].paradas[0].distancia_km).toBeNull()
    expect(out[0].paradas[1].distancia_km).toBe(3)
  })

  it('veículo com só 1 parada não chama a API e fica igual', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    const out = await enriquecerComKmReal([resumoVeiculo({ paradas: [parada()], qtd_paradas: 1 })], 'fake-key')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out[0].paradas[0].distancia_km).toBeNull()
  })

  it('veículo com parada sem coordenada fica igual, sem chamar a API', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    const semCoord = resumoVeiculo({ paradas: [parada(), parada({ ordem: 2, lat: null, lng: null })] })
    const out = await enriquecerComKmReal([semCoord], 'fake-key')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out[0]).toEqual(semCoord)
  })

  it('falha da ORS mantém o veículo como veio (best-effort, não quebra a geração)', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    const original = resumoVeiculo()
    const out = await enriquecerComKmReal([original], 'fake-key')
    expect(out[0]).toEqual(original)
  })
})
