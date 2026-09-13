import { describe, it, expect } from 'vitest'
import { narrowGeoMotivo } from './route'

// Finding 8 (fix wave 12/09): geoMotivo em types.ts foi estreitado pra union
// de 2 literais -- este helper e' o ponto onde o `motivo` (string solto,
// vindo da ponte HTTP/cache em geocode.ts) vira esse union com seguranca de
// tipo, em vez de um `as` as cegas.
describe('narrowGeoMotivo', () => {
  it('preserva os dois motivos conhecidos', () => {
    expect(narrowGeoMotivo('municipio_divergente')).toBe('municipio_divergente')
    expect(narrowGeoMotivo('bairro_divergente')).toBe('bairro_divergente')
  })

  it('undefined continua undefined', () => {
    expect(narrowGeoMotivo(undefined)).toBeUndefined()
  })

  it('qualquer valor desconhecido vira undefined (fail-open, nunca sustenta rotulo)', () => {
    expect(narrowGeoMotivo('valor_desconhecido')).toBeUndefined()
    expect(narrowGeoMotivo('')).toBeUndefined()
  })
})
