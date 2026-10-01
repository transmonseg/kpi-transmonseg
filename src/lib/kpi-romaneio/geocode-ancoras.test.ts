import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reposicionarPorAncoras, type GrupoAncoras } from './geocode-ancoras'
import { enderecosColididosPorCoordenada } from './endereco-cep'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  process.env.MOTOR_SECRET = 'segredo'
  process.env.MONITORAMENTO_URL = 'http://mon.local'
  fetchMock.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

const grupos: GrupoAncoras[] = [
  { id: 'JIE8C41|2026-09-05', ruas: ['ESTRADA DO MATO ALTO', 'RUA SEM MATCH'], ancoras: [{ lat: -22.9028, lng: -43.5606 }] },
  { id: 'RKE4H10|2026-09-05', ruas: ['AVENIDA EIXO METROPOLITANO'], ancoras: [] },
]

describe('reposicionarPorAncoras', () => {
  it('chama a ponte com x-motor-key e devolve os resultados por grupo, na ordem das ruas', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      grupos: [
        { id: 'JIE8C41|2026-09-05', resultados: [{ lat: -22.903, lng: -43.561 }, null] },
        { id: 'RKE4H10|2026-09-05', resultados: [null] },
      ],
    }), { status: 200 }))

    const r = await reposicionarPorAncoras(grupos)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://mon.local/api/romaneio/geocode-ancoras')
    expect((init.headers as Record<string, string>)['x-motor-key']).toBe('segredo')
    expect(JSON.parse(init.body as string)).toEqual({ grupos })
    expect(r.get('JIE8C41|2026-09-05')![0]).toEqual({ lat: -22.903, lng: -43.561 })
    expect(r.get('JIE8C41|2026-09-05')![1]).toBeNull()
    expect(r.get('RKE4H10|2026-09-05')![0]).toBeNull()
  })

  it('falha graciosa: ponte fora do ar => tudo null, mesmo tamanho das ruas, nunca lança', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await reposicionarPorAncoras(grupos)
    expect(r.get('JIE8C41|2026-09-05')).toEqual([null, null])
    expect(r.get('RKE4H10|2026-09-05')).toEqual([null])
  })

  it('resposta HTTP != 200 => falha graciosa igual', async () => {
    fetchMock.mockResolvedValue(new Response('erro', { status: 500 }))
    const r = await reposicionarPorAncoras(grupos)
    expect(r.get('JIE8C41|2026-09-05')).toEqual([null, null])
  })

  it('grupo que a ponte não devolveu (ou tamanho errado) vira null só pra ele', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      grupos: [{ id: 'RKE4H10|2026-09-05', resultados: [{ lat: -22.97, lng: -43.37 }] }],
    }), { status: 200 }))
    const r = await reposicionarPorAncoras(grupos)
    expect(r.get('JIE8C41|2026-09-05')).toEqual([null, null])
    expect(r.get('RKE4H10|2026-09-05')![0]).toEqual({ lat: -22.97, lng: -43.37 })
  })

  it('sem grupos => Map vazio, sem chamar a ponte', async () => {
    const r = await reposicionarPorAncoras([])
    expect(r.size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('enderecosColididosPorCoordenada', () => {
  it('2+ enderecos diferentes no mesmo ponto exato: todos colididos', () => {
    const geo = new Map([
      ['RUA A, 1 - X, Y - *', { lat: -22.1, lng: -43.1 }],
      ['RUA A, 99 - X, Y - *', { lat: -22.1, lng: -43.1 }],
      ['RUA B, 2 - X, Y - *', { lat: -22.2, lng: -43.2 }],
      ['RUA C, 3 - X, Y - *', null],
    ])
    expect([...enderecosColididosPorCoordenada(geo)].sort()).toEqual(['RUA A, 1 - X, Y - *', 'RUA A, 99 - X, Y - *'])
  })

  // Regressao 01/10: o mesmo endereco com e sem sufixo de CEP (romaneio com
  // CEP + pao sem CEP, ou CEP com/sem hifen) recebe a MESMA coordenada da mesma
  // linha do cache -- e' o mesmo endereco, nao colapso de via longa.
  it('mesmo endereco com e sem CEP no mesmo ponto NAO e colisao', () => {
    const geo = new Map([
      ['RUA A, 1 - X, Y - * - 28300000', { lat: -22.1, lng: -43.1 }],
      ['RUA A, 1 - X, Y - *', { lat: -22.1, lng: -43.1 }],
      ['RUA A, 1 - X, Y - * - 28300-000', { lat: -22.1, lng: -43.1 }],
    ])
    expect(enderecosColididosPorCoordenada(geo).size).toBe(0)
  })

  it('com CEP e endereco realmente diferente no mesmo ponto: colide (todas as variantes)', () => {
    const geo = new Map([
      ['RUA A, 1 - X, Y - * - 28300000', { lat: -22.1, lng: -43.1 }],
      ['RUA A, 1 - X, Y - *', { lat: -22.1, lng: -43.1 }],
      ['RUA A, 50 - X, Y - * - 28300000', { lat: -22.1, lng: -43.1 }],
    ])
    expect(enderecosColididosPorCoordenada(geo).size).toBe(3)
  })
})
