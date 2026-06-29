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

  it('raio mínimo 150m: aceita ponto a 160m mesmo com raio=100 no cadastro (caso Caxias II)', () => {
    // Simula o bug real: Unitrac cadastra geofence com raio=100m mas entrega ocorre a
    // 157m do centro. Sem o raio mínimo, FORA_BASE. Com RAIO_MIN_M=150, LOJA.
    const pontos = { '560057': { nome: 'SENDAS CAXIAS II', lat: -22.726031, lon: -43.314276, raio: 100, cod: '560057' } }
    // ~160m de distância (dentro de 150+30=180m com raio mínimo)
    const hit = acharLojaPorCoordenada(-22.7257, -43.3129, pontos)
    expect(hit?.cod).toBe('560057')
  })

  it('raio mínimo não expande para distâncias claramente fora (>180m)', () => {
    const pontos = { '560057': { nome: 'SENDAS CAXIAS II', lat: -22.726031, lon: -43.314276, raio: 100, cod: '560057' } }
    // ~300m de distância — fora mesmo com raio mínimo
    expect(acharLojaPorCoordenada(-22.728, -43.312, pontos)).toBeNull()
  })
})
