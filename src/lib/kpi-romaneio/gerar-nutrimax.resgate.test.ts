import { describe, it, expect } from 'vitest'
import { aplicarResgateAncora } from './gerar-nutrimax'
import type { LinhaGeocodificada } from './types'

// GEO-13 (auditoria 20/10, revisao final 23/10): depois que o resgate por
// ancora passou a achar candidatos, a linha resgatada nao pode sair
// "confiavel" -- a ancora busca a rua pelo nome sem municipio/bairro.
const linha = (nf: string, extra: Partial<LinhaGeocodificada> = {}): LinhaGeocodificada => ({
  nf, placa: 'RQU2G47', endereco: `RUA X, ${nf} - CENTRO, ITAPERUNA`, lat: -21.2, lng: -41.9, geoConfiavel: true, geoPrecisao: 'exato', ...extra,
} as LinhaGeocodificada)

describe('aplicarResgateAncora (GEO-13)', () => {
  it('linha resgatada: troca o ponto e sai NAO confiavel, precisao rua', () => {
    const r = aplicarResgateAncora(linha('1', { lat: null, lng: null }), { lat: -21.3, lng: -41.8 }, false)
    expect([r.lat, r.lng]).toEqual([-21.3, -41.8])
    expect(r.geoConfiavel).toBe(false)
    expect(r.geoPrecisao).toBe('rua')
  })
  it('linha colidida sem resgate: mantem o ponto mas nunca fica exato/interpolado', () => {
    const r = aplicarResgateAncora(linha('2'), null, true)
    expect([r.lat, r.lng]).toEqual([-21.2, -41.9])
    expect(r.geoPrecisao).toBe('rua')
  })
  it('linha sem coordenada e sem resgate: nao mexe', () => {
    const l = linha('3', { lat: null, lng: null })
    expect(aplicarResgateAncora(l, null, false)).toEqual(l)
  })
})
