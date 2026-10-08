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

  it('carro com carga propria GRANDE no dia nao e candidato (so\' o de carga pequena, 08/10)', () => {
    const outra = [0, 1, 2, 3].map(i => ({ carga: '999', placa: 'RQR2G85', endereco: `RUA X, ${i}`, lat: -21 - i * 0.05, lng: -41 }))
    const paradas = new Map([
      ['TTK8A87', []],
      ['RQR2G85', enderecos.map(e => parada('RQR2G85', e.lat, e.lng))],
      ['TOS1I21', [parada('TOS1I21', enderecos[0].lat, enderecos[0].lng)]],
    ])
    expect(sugerirTrocas([...enderecos, ...outra], paradas)).toEqual([])
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

  // 08/10 (Erica): UNN6G81 (21 NFs) ficou na base e o RQV5F67, MESMO motorista e
  // com 1 NF propria, rodou a carga inteira -- o aviso so' olhava carro sem carga.
  it('carro com so\' 1 endereco proprio que rodou a carga do outro: sugere (UNN6G81 x RQV5F67 08/10)', () => {
    const carga = [0, 1, 2, 3, 4].map(i => ({ carga: '99621', placa: 'UNN6G81', endereco: `AV ${i}, 5`, lat: -22.5 + i * 3000 * M, lng: -42.0 }))
    const propria = { carga: '99698', placa: 'RQV5F67', endereco: 'RUA LONGE, 1', lat: -23.5, lng: -43.5 }
    const paradas = new Map([
      ['UNN6G81', [parada('UNN6G81', -22.8, -43.2, 'BASE')]],
      ['RQV5F67', [...carga.slice(0, 4).map(e => parada('RQV5F67', e.lat + 30 * M, e.lng)), parada('RQV5F67', propria.lat, propria.lng)]],
    ])
    expect(sugerirTrocas([...carga, propria], paradas)).toEqual([
      { carga: '99621', placaEscala: 'UNN6G81', placaSugerida: 'RQV5F67', enderecosVisitados: 4, enderecosDaCarga: 5 },
    ])
  })
  it('carro com carga propria grande (fez a sua) nao e candidato', () => {
    const a = [0, 1, 2, 3].map(i => ({ carga: 'A', placa: 'AAA1A11', endereco: `A${i}`, lat: -22.5 + i * 3000 * M, lng: -42.0 }))
    const b = [0, 1, 2, 3].map(i => ({ carga: 'B', placa: 'BBB2B22', endereco: `B${i}`, lat: -22.5 + i * 3000 * M, lng: -42.0 + 0.0003 }))
    const paradas = new Map([['AAA1A11', [parada('AAA1A11', -22.8, -43.2, 'BASE')]], ['BBB2B22', [...b.map(e => parada('BBB2B22', e.lat, e.lng))]]])
    expect(sugerirTrocas([...a, ...b], paradas)).toEqual([])
  })
})
