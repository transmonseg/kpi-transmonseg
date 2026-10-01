import { describe, it, expect } from 'vitest'
import { montarCorredorDaRua, extensaoCorredorM } from './corredor-rua'

// Fixtures do relatorio rq-mesmo-lugar-e-sem-rastreador.md (01/10), cluster #1:
// AV. DAS AMERICAS / BARRA DA TIJUCA, 61 clientes no MESMO ponto
// (-23.00075,-43.37481). Os outros pontos sao aglomerados CNEFE da mesma rua
// como a ponte de coerencia devolve (pontosZona, com municipio IBGE).
const RIO = '3304557'
const CAXIAS = '3301702'
const PONTO_BARRA = { lat: -23.00075, lng: -43.37481 }
const C0 = { lat: -23.00075, lng: -43.37481, municipioCodigo: RIO }
const C1 = { lat: -23.0003, lng: -43.3650, municipioCodigo: RIO }      // ~1 km a leste
const C2 = { lat: -23.0005, lng: -43.3950, municipioCodigo: RIO }      // ~2 km a oeste
const RECREIO_LONGE = { lat: -23.0180, lng: -43.4600, municipioCodigo: RIO } // ~8,8 km
const ZONA_NORTE = { lat: -22.8583, lng: -43.2421, municipioCodigo: RIO }    // ~20 km (caso "Recreio caiu na zona norte")
const HOMONIMA_OUTRO_MUNICIPIO = { lat: -22.9950, lng: -43.3700, municipioCodigo: CAXIAS }

describe('montarCorredorDaRua', () => {
  it('fica so com os pontos da MESMA rua no MESMO municipio do endereco, ate 8 km do ponto aproximado', () => {
    const corredor = montarCorredorDaRua(PONTO_BARRA, [C0, C1, C2, RECREIO_LONGE, ZONA_NORTE, HOMONIMA_OUTRO_MUNICIPIO])
    expect(corredor).toEqual([C0, C1, C2])
  })

  it('ponto aproximado longe (>2 km) de todo ponto da rua => sem corredor (geocode nao e desta rua)', () => {
    expect(montarCorredorDaRua({ lat: -22.80, lng: -43.10 }, [C0, C1, C2])).toEqual([])
  })

  it('sem pontos da rua => sem corredor', () => {
    expect(montarCorredorDaRua(PONTO_BARRA, [])).toEqual([])
  })
})

describe('extensaoCorredorM', () => {
  it('maior distancia entre dois pontos do corredor (Americas: ~3 km)', () => {
    const ext = extensaoCorredorM([C0, C1, C2])
    expect(ext).toBeGreaterThan(2900)
    expect(ext).toBeLessThan(3200)
  })
  it('rua de um ponto so => 0', () => {
    expect(extensaoCorredorM([C0])).toBe(0)
    expect(extensaoCorredorM([])).toBe(0)
  })
})
