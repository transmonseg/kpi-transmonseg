import { describe, it, expect } from 'vitest'
import { confirmaEntregaViaApi, type StopParaConfirmar } from './confirma'
import type { MapaPontos } from './pontos'

// Geofences reais (Super Prix Niterói LJ 13 vs Tijuquinha Loja 13) — o caso FUM-8748.
const pontos: MapaPontos = {
  '3030113': { cod: '3030113', nome: 'SUPERPRIX LJ 13 - NITEROI', lat: -22.90327, lon: -43.11062, raio: 200 },
  '3030013': { cod: '3030013', nome: 'SUPER PRIX TIJUQUINHA', lat: -22.923587, lon: -43.231938, raio: 200 },
}

// Parada real do FUM às 05:51, a 15m da geofence de Niterói.
const stopNiteroi: StopParaConfirmar = {
  id: 'p-niteroi', lat: -22.90316, lng: -43.11053,
  chegada: '2026-06-12T05:51:00Z', saida: '2026-06-12T06:39:00Z', classificacao: 'FORA_BASE',
}
const stopIcarai: StopParaConfirmar = {
  id: 'p-icarai', lat: -22.90721, lng: -43.10379,
  chegada: '2026-06-12T06:42:00Z', saida: '2026-06-12T07:28:00Z', classificacao: 'FORA_BASE',
}

describe('confirmaEntregaViaApi — gabarito autoritativo da API', () => {
  it('confirma a parada de Niterói pela geofence 3030113 (caso FUM-8748)', () => {
    const r = confirmaEntregaViaApi('3030113', [stopNiteroi, stopIcarai], pontos)
    expect(r?.stopId).toBe('p-niteroi')
    expect(r?.codU).toBe('3030113')
    expect(r?.distMetros).toBeLessThan(30)
  })

  it('NÃO confirma Tijuquinha (3030013) com paradas que caem só em Niterói', () => {
    // A placa parou em Niterói/Icaraí, não em Tijuquinha — a API não pode confirmar
    // uma entrega que não aconteceu (evita falso positivo na correção).
    const r = confirmaEntregaViaApi('3030013', [stopNiteroi, stopIcarai], pontos)
    expect(r).toBeNull()
  })

  it('sem código esperado → null (não há o que confirmar)', () => {
    expect(confirmaEntregaViaApi(null, [stopNiteroi], pontos)).toBeNull()
  })

  it('ignora paradas BASE e sem coordenada', () => {
    const base: StopParaConfirmar = { id: 'b', lat: -22.8, lng: -43.3, chegada: '2026-06-12T04:00:00Z', saida: null, classificacao: 'BASE' }
    const semCoord: StopParaConfirmar = { id: 'sc', lat: null, lng: null, chegada: '2026-06-12T05:00:00Z', saida: null, classificacao: 'FORA_BASE' }
    expect(confirmaEntregaViaApi('3030113', [base, semCoord], pontos)).toBeNull()
  })

  it('escolhe a parada mais cedo quando há duas na mesma geofence', () => {
    const tarde: StopParaConfirmar = { ...stopNiteroi, id: 'p-tarde', chegada: '2026-06-12T08:00:00Z' }
    const r = confirmaEntregaViaApi('3030113', [tarde, stopNiteroi], pontos)
    expect(r?.stopId).toBe('p-niteroi')
  })
})
