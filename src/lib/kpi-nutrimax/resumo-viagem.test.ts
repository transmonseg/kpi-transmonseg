import { describe, it, expect } from 'vitest'
import { montaResumoViagemPorPlaca } from './resumo-viagem'
import type { ResumoVeiculo, ParadaUnitrac } from '@/lib/types/unitrac'

function parada(overrides: Partial<ParadaUnitrac> = {}): ParadaUnitrac {
  return {
    placa_norm: 'RBI0J25',
    chegada: new Date('2026-07-15T05:07:00.000Z'),
    saida: new Date('2026-07-15T05:14:00.000Z'),
    duracao_seg: 420,
    distancia_km: null,
    endereco: null,
    lat: null,
    lng: null,
    local_parada: '',
    codigo_loja: null,
    nome_loja: null,
    classificacao: 'LOJA',
    ordem: 1,
    ...overrides,
  }
}

function resumo(overrides: Partial<ResumoVeiculo> = {}): ResumoVeiculo {
  return {
    placa_norm: 'RBI0J25',
    placa_raw: 'RBI-0J25',
    inicio_viagem: new Date('2026-07-15T05:07:00.000Z'),
    fim_viagem: new Date('2026-07-15T14:08:00.000Z'),
    qtd_paradas: 2,
    saida_cd: null,
    paradas: [parada({ distancia_km: 10.2 }), parada({ distancia_km: 5.3 })],
    ...overrides,
  }
}

describe('montaResumoViagemPorPlaca', () => {
  it('soma o km das paradas e traz início/fim de viagem em ISO', () => {
    const r = montaResumoViagemPorPlaca([resumo()])
    expect(r).toEqual([{
      placaNorm: 'RBI0J25',
      kmPercorrido: 15.5,
      qtdParadas: 2,
      inicioViagem: '2026-07-15T05:07:00.000Z',
      fimViagem: '2026-07-15T14:08:00.000Z',
    }])
  })

  it('kmPercorrido null quando nenhuma parada tem distancia_km (não confunde com 0)', () => {
    const r = montaResumoViagemPorPlaca([resumo({ paradas: [parada({ distancia_km: null })] })])
    expect(r[0].kmPercorrido).toBeNull()
  })

  it('inicioViagem/fimViagem null quando o veículo não tem viagem completa', () => {
    const r = montaResumoViagemPorPlaca([resumo({ inicio_viagem: null, fim_viagem: null })])
    expect(r[0].inicioViagem).toBeNull()
    expect(r[0].fimViagem).toBeNull()
  })

  it('processa vários veículos', () => {
    const r = montaResumoViagemPorPlaca([resumo(), resumo({ placa_norm: 'ABC1D23', paradas: [parada({ distancia_km: 1 })] })])
    expect(r.map(x => x.placaNorm)).toEqual(['RBI0J25', 'ABC1D23'])
  })
})
