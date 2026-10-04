import { describe, it, expect } from 'vitest'
import { detectarTrocasProvaveis } from './troca-placa'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

const M = 1 / 111_195
const parada = (placa: string, lat: number, lng: number, min = 10): UnitracParadaRow => ({
  id: `${placa}-${lat}`, placa_norm: placa, lat, lng, ordem: 1, chegada: '2026-10-03T10:00:00.000Z',
  saida: new Date(Date.parse('2026-10-03T10:00:00.000Z') + min * 60_000).toISOString(), fim_real: null,
  endereco: null, nome_loja: null, codigo_loja: null, duracao_seg: min * 60, local_parada: null, classificacao: 'FORA_BASE',
} as unknown as UnitracParadaRow)

describe('troca de placa (aviso, nunca confirma)', () => {
  const clientes = [0, 1000, 2000, 3000].map(d => ({ lat: -22 + d * M, lng: -42 }))
  const cargas = new Map([['99291::RQV5F67', clientes]])

  it('caso real 03/10: outra placa parou na maioria dos clientes da carga -> aponta a troca', () => {
    const paradas = new Map([
      ['RQV5F67', [parada('RQV5F67', -21, -41)]],
      ['RBG4F53', clientes.slice(0, 3).map(c => parada('RBG4F53', c.lat + 50 * M, c.lng))],
    ])
    const r = detectarTrocasProvaveis(cargas, new Set(['99291::RQV5F67']), paradas)
    expect(r.get('99291::RQV5F67')).toEqual({ outraPlaca: 'RBG4F53', nfsPerto: 3, nfsComCoord: 4 })
  })

  it('outra placa so passou perto de 1 cliente -> nao aponta troca', () => {
    const paradas = new Map([['RBG4F53', [parada('RBG4F53', clientes[0].lat, clientes[0].lng)]]])
    expect(detectarTrocasProvaveis(cargas, new Set(['99291::RQV5F67']), paradas).size).toBe(0)
  })

  it('parada de 1 min (passagem) nao conta', () => {
    const paradas = new Map([['RBG4F53', clientes.map(c => parada('RBG4F53', c.lat, c.lng, 1))]])
    expect(detectarTrocasProvaveis(cargas, new Set(['99291::RQV5F67']), paradas).size).toBe(0)
  })
})
