import { describe, it, expect } from 'vitest'
import { montaKpiLojaNutrimax } from './kpi-loja'
import type { LinhaEscalaNutrimax } from './types'
import type { AlvoApi } from '@/lib/unitrac-api/alvos'
import type { ResumoVeiculo, ParadaUnitrac } from '@/lib/types/unitrac'

function escala(overrides: Partial<LinhaEscalaNutrimax> = {}): LinhaEscalaNutrimax {
  return {
    carga: '92593', placaRaw: 'TTL7D40', placaNorm: 'TTL7D40', destino: 'CAMPOS',
    motorista: 'LUAN VIANA AREAS RIBEIRO', ajudante1: null, ajudante2: null,
    pesoKg: 2405, entPlanejado: 1, nfPlanejado: 1, ...overrides,
  }
}

function alvo(overrides: Partial<AlvoApi> = {}): AlvoApi {
  return {
    placaNorm: 'TTL7D40', codigoUnitrac: '129145', nome: 'WW CARNES MERCEARIA EIRELI',
    situacao: 1, feitoISO: '2026-08-06T10:20:21.120Z', inicioISO: '2026-08-06T07:00:00Z',
    documento: '2310197', ordem: 0, rota: '95211', ...overrides,
  }
}

function parada(overrides: Partial<ParadaUnitrac> = {}): ParadaUnitrac {
  return {
    placa_norm: 'TTL7D40', chegada: new Date('2026-08-06T07:00:00Z'), saida: new Date('2026-08-06T07:05:00Z'),
    duracao_seg: 300, distancia_km: 10, endereco: null, lat: -22.8, lng: -43.2,
    local_parada: 'BASE - BASE GARAGEM', codigo_loja: null, nome_loja: null,
    classificacao: 'BASE', ordem: 1, ...overrides,
  }
}

function resumo(overrides: Partial<ResumoVeiculo> = {}): ResumoVeiculo {
  return {
    placa_norm: 'TTL7D40', placa_raw: 'TTL7D40', inicio_viagem: null, fim_viagem: null,
    qtd_paradas: 0, saida_cd: null, paradas: [], ...overrides,
  }
}

describe('montaKpiLojaNutrimax', () => {
  it('caminho feliz: loja confirmada com GPS batendo — todas as colunas preenchidas', () => {
    const paradaBase = parada({ classificacao: 'BASE', chegada: new Date('2026-08-06T07:00:00Z'), saida: new Date('2026-08-06T07:00:00Z'), ordem: 1 })
    const paradaLoja = parada({
      classificacao: 'LOJA', codigo_loja: '129145', nome_loja: 'WW CARNES MERCEARIA EIRELI',
      chegada: new Date('2026-08-06T10:20:00Z'), saida: new Date('2026-08-06T10:35:00Z'), ordem: 2,
    })
    const paradaVoltaBase = parada({ classificacao: 'BASE', chegada: new Date('2026-08-06T12:00:00Z'), saida: new Date('2026-08-06T12:00:00Z'), ordem: 3 })

    const r = montaKpiLojaNutrimax(
      [escala()],
      [alvo()],
      [resumo({ paradas: [paradaBase, paradaLoja, paradaVoltaBase] })],
    )

    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      loja: 'WW CARNES MERCEARIA EIRELI',
      motorista: 'LUAN VIANA AREAS RIBEIRO',
      placaNorm: 'TTL7D40',
      saidaBase: '2026-08-06T07:00:00.000Z',
      chegadaLoja: '2026-08-06T10:20:21.120Z',
      saidaLoja: '2026-08-06T10:35:00.000Z',
      chegadaBase: '2026-08-06T12:00:00.000Z',
      status: 'confirmado',
    })
    expect(r[0].tempoNaLojaMin).toBeGreaterThan(0)
    expect(r[0].tempoOperacaoMin).toBeGreaterThan(0)
  })
})
