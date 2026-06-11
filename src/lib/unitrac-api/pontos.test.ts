import { describe, it, expect, vi, afterEach } from 'vitest'
import { buscarPontos, acharLojaPorCoordenada } from './pontos'

afterEach(() => vi.restoreAllMocks())

const ALVOS = {
  alvos: [
    { pontoidentificador: '560036', pontonome: 'LOJA A', pontolatitude: -22.9, pontolongitude: -43.2, pontoraio: 50, alvosituacaoservico: 0 },
    { pontoidentificador: '0', pontonome: 'ZERADO', pontolatitude: 0, pontolongitude: 0, pontoraio: 50, alvosituacaoservico: 0 },
  ],
}

describe('buscarPontos', () => {
  it('indexa por pontoidentificador e descarta coord zerada', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(ALVOS), { status: 200 }))
    const m = await buscarPontos(['18594'])
    expect(Object.keys(m)).toEqual(['560036'])
    expect(m['560036']).toMatchObject({ nome: 'LOJA A', lat: -22.9, lon: -43.2, raio: 50 })
  })

  it('retorna {} quando a API cai', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))
    expect(await buscarPontos(['1'])).toEqual({})
  })
})

describe('acharLojaPorCoordenada', () => {
  it('retorna o ponto dentro do raio+margem', () => {
    const pontos = { '560036': { nome: 'LOJA A', lat: -22.9, lon: -43.2, raio: 50, cod: '560036' } }
    const hit = acharLojaPorCoordenada(-22.9001, -43.2001, pontos)
    expect(hit?.cod).toBe('560036')
  })

  it('retorna null quando longe de todos', () => {
    const pontos = { '560036': { nome: 'LOJA A', lat: -22.9, lon: -43.2, raio: 50, cod: '560036' } }
    expect(acharLojaPorCoordenada(-23.5, -43.9, pontos)).toBeNull()
  })
})
