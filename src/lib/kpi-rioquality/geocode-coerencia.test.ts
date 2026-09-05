import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { geocodificarPorCoerencia, type GrupoCoerencia } from './geocode-coerencia'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  process.env.MOTOR_SECRET = 'segredo'
  process.env.MONITORAMENTO_URL = 'http://mon.local'
  fetchMock.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

const grupos: GrupoCoerencia[] = [
  { id: 'RJM5B51', zona: 'BAIXADA', ruas: ['AV. AUTOMOVEL CLUBE', 'RUA NOVE'] },
  { id: 'SRL9A58', zona: null, ruas: ['AVENIDA DAS AMERICAS'] },
]

describe('geocodificarPorCoerencia', () => {
  it('chama a ponte do monitoramento com x-motor-key e devolve os resultados por grupo, na ordem das ruas', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      grupos: [
        { id: 'RJM5B51', resultados: [
          { lat: -22.79, lng: -43.30, municipioCodigo: '3301702', confianca: 'alta', candidatos: 1, ancora: true },
          { lat: -22.792, lng: -43.302, municipioCodigo: '3301702', confianca: 'alta', candidatos: 3, ancora: false },
        ] },
        { id: 'SRL9A58', resultados: [
          { lat: null, lng: null, municipioCodigo: null, confianca: 'sem_candidato', candidatos: 0, ancora: false },
        ] },
      ],
      meta: { nomesUnicos: 3 },
    }), { status: 200 }))

    const r = await geocodificarPorCoerencia(grupos)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://mon.local/api/romaneio/geocode-coerencia')
    expect((init.headers as Record<string, string>)['x-motor-key']).toBe('segredo')
    expect(JSON.parse(init.body as string)).toEqual({ grupos })
    expect(r.get('RJM5B51')![1]).toMatchObject({ lat: -22.792, confianca: 'alta' })
    expect(r.get('SRL9A58')![0]).toMatchObject({ lat: null, confianca: 'sem_candidato' })
  })

  it('falha graciosa: ponte fora do ar => todo mundo sem_candidato, mesmo tamanho das ruas, nunca lança', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await geocodificarPorCoerencia(grupos)
    expect(r.get('RJM5B51')).toHaveLength(2)
    expect(r.get('RJM5B51')![0]).toMatchObject({ lat: null, lng: null, confianca: 'sem_candidato' })
    expect(r.get('SRL9A58')).toHaveLength(1)
  })

  it('resposta HTTP != 200 ou sem campo grupos => falha graciosa igual', async () => {
    fetchMock.mockResolvedValue(new Response('erro', { status: 500 }))
    const r = await geocodificarPorCoerencia(grupos)
    expect(r.get('SRL9A58')![0].confianca).toBe('sem_candidato')
  })

  it('grupo que a ponte não devolveu (ou devolveu com tamanho errado) vira sem_candidato só pra ele', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      grupos: [{ id: 'SRL9A58', resultados: [{ lat: -23, lng: -43.37, municipioCodigo: '3304557', confianca: 'alta', candidatos: 1, ancora: true }] }],
    }), { status: 200 }))
    const r = await geocodificarPorCoerencia(grupos)
    expect(r.get('RJM5B51')!.every(x => x.confianca === 'sem_candidato')).toBe(true)
    expect(r.get('SRL9A58')![0].lat).toBe(-23)
  })

  it('sem grupos => Map vazio, sem chamar a ponte', async () => {
    const r = await geocodificarPorCoerencia([])
    expect(r.size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
