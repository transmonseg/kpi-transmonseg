import { describe, it, expect } from 'vitest'
import { sugerirTrocas } from './sugerir-trocas'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

const M = 1 / 111_195
const parada = (placa: string, lat: number, lng: number, classificacao: 'FORA_BASE' | 'BASE' = 'FORA_BASE') =>
  ({ id: `${placa}-${lat}`, placa_norm: placa, classificacao, lat, lng, chegada: '2026-10-06T09:00:00Z', saida: '2026-10-06T09:05:00Z', fim_real: '2026-10-06T09:05:00Z' }) as unknown as UnitracParadaRow

// PAO-3 06/10: escala TTK8A87 (na base), quem rodou foi RQR2G85 (fora da escala).
const enderecos = [0, 1, 2, 3].map(i => ({ carga: 'PAO-3', placa: 'TTK8A87', endereco: `RUA ${i}, 10`, lat: -22.98 + i * 2000 * M, lng: -43.22 }))

describe('sugerirTrocas', () => {
  it('escalado parado na base e carro fora da escala nos enderecos: sugere a troca', () => {
    const paradas = new Map([
      ['TTK8A87', [parada('TTK8A87', -22.81, -43.27, 'BASE')]],
      ['RQR2G85', enderecos.slice(0, 3).map(e => parada('RQR2G85', e.lat + 50 * M, e.lng))],
      ['TOS1I21', [parada('TOS1I21', enderecos[0].lat, enderecos[0].lng)]],
    ])
    expect(sugerirTrocas(enderecos, paradas)).toEqual([
      { carga: 'PAO-3', placaEscala: 'TTK8A87', placaSugerida: 'RQR2G85', enderecosVisitados: 3, enderecosDaCarga: 4 },
    ])
  })

  it('escalado passou nos enderecos da carga: nao sugere nada', () => {
    const paradas = new Map([
      ['TTK8A87', [parada('TTK8A87', enderecos[0].lat, enderecos[0].lng)]],
      ['RQR2G85', enderecos.map(e => parada('RQR2G85', e.lat, e.lng))],
    ])
    expect(sugerirTrocas(enderecos, paradas)).toEqual([])
  })

  it('carro com carga propria no dia nao e candidato; menos da metade dos enderecos nao sugere', () => {
    const outra = { carga: '999', placa: 'RQR2G85', endereco: 'RUA X, 1', lat: -21, lng: -41 }
    const paradas = new Map([
      ['TTK8A87', []],
      ['RQR2G85', enderecos.map(e => parada('RQR2G85', e.lat, e.lng))],
      ['TOS1I21', [parada('TOS1I21', enderecos[0].lat, enderecos[0].lng)]],
    ])
    expect(sugerirTrocas([...enderecos, outra], paradas)).toEqual([])
  })

  it('escalado andou ate a rua da base (parada fora da base longe da carga): ainda sugere (TTI6E49 06/10)', () => {
    const paradas = new Map([
      ['TTK8A87', [parada('TTK8A87', -22.81, -43.265)]],
      ['RQR2G85', enderecos.slice(0, 3).map(e => parada('RQR2G85', e.lat, e.lng))],
    ])
    expect(sugerirTrocas(enderecos, paradas).map(x => x.placaSugerida)).toEqual(['RQR2G85'])
  })

  it('empate entre dois candidatos: nao sugere', () => {
    const paradas = new Map([
      ['TTK8A87', []],
      ['RQR2G85', enderecos.slice(0, 2).map(e => parada('RQR2G85', e.lat, e.lng))],
      ['TOS1I21', enderecos.slice(2, 4).map(e => parada('TOS1I21', e.lat, e.lng))],
    ])
    expect(sugerirTrocas(enderecos, paradas)).toEqual([])
  })
})
