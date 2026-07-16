import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/unitrac-api/frota', () => ({
  buscarFrota: vi.fn(async () => [
    { cv: '111', placa: 'TTL-7D40', placaNorm: 'TTL7D40' },
    { cv: '222', placa: 'ZZZ-9Z99', placaNorm: 'ZZZ9Z99' }, // não está na escala do teste
  ]),
}))
vi.mock('@/lib/unitrac-api/pontos', () => ({
  buscarPontos: vi.fn(async () => ({})),
}))
vi.mock('@/lib/unitrac-api/consolida', () => ({
  buscarStopsCru: vi.fn(async () => []),
  consolidaParadasApi: vi.fn((_eventos: unknown, _pontos: unknown, _data: string, placaNorm: string) => {
    if (placaNorm !== 'TTL7D40') return []
    return [{
      id: 'TTL7D40-api-1', placa_norm: 'TTL7D40',
      chegada: '2026-07-15T10:00:00.000Z', saida: '2026-07-15T10:20:00.000Z',
      duracao_seg: 1200, local_parada: '165049 - CLIENTE TESTE',
      codigo_loja: '165049', nome_loja: 'CLIENTE TESTE',
      lat: -22.9, lng: -43.2, endereco: null, classificacao: 'LOJA', ordem: 1,
    }]
  }),
}))

import { buscarResumosViagemViaApi, mesclarResumosPdfApi } from './api-paradas'
import type { ResumoVeiculo, ParadaUnitrac } from '@/lib/types/unitrac'

function parada(overrides: Partial<ParadaUnitrac> = {}): ParadaUnitrac {
  return {
    placa_norm: 'TTL7D40',
    chegada: new Date('2026-07-15T10:00:00.000Z'),
    saida: new Date('2026-07-15T10:20:00.000Z'),
    duracao_seg: 1200,
    distancia_km: 12.5,
    endereco: null,
    lat: -22.9,
    lng: -43.2,
    local_parada: '165049 - CLIENTE TESTE',
    codigo_loja: '165049',
    nome_loja: 'CLIENTE TESTE',
    classificacao: 'LOJA',
    ordem: 1,
    ...overrides,
  }
}

function resumoVeiculo(overrides: Partial<ResumoVeiculo> = {}): ResumoVeiculo {
  return {
    placa_norm: 'TTL7D40',
    placa_raw: 'TTL7D40',
    inicio_viagem: new Date('2026-07-15T08:00:00.000Z'),
    fim_viagem: new Date('2026-07-15T16:00:00.000Z'),
    qtd_paradas: 1,
    saida_cd: null,
    paradas: [parada()],
    ...overrides,
  }
}

describe('buscarResumosViagemViaApi', () => {
  it('filtra pelas placas da escala e ignora as que não estão nela', async () => {
    const resumos = await buscarResumosViagemViaApi(new Set(['TTL7D40']), '2026-07-15')
    expect(resumos).toHaveLength(1)
    expect(resumos[0].placa_norm).toBe('TTL7D40')
  })

  it('distancia_km sempre null (API ao vivo não devolve km por parada)', async () => {
    const resumos = await buscarResumosViagemViaApi(new Set(['TTL7D40']), '2026-07-15')
    expect(resumos[0].paradas.every(p => p.distancia_km === null)).toBe(true)
  })

  it('retorna [] quando nenhuma placa da frota está na escala', async () => {
    const resumos = await buscarResumosViagemViaApi(new Set(['XXX0000']), '2026-07-15')
    expect(resumos).toEqual([])
  })
})

describe('mesclarResumosPdfApi', () => {
  it('parada da API duplicada (mesma coordenada e horário do PDF) é descartada — mantém o dado do PDF', () => {
    const pdf = [resumoVeiculo()]
    const api = [resumoVeiculo({ paradas: [parada({ distancia_km: null })] })] // mesma coordenada/horário, sem km (como a API real)
    const out = mesclarResumosPdfApi(pdf, api)
    expect(out).toHaveLength(1)
    expect(out[0].paradas).toHaveLength(1)
    expect(out[0].paradas[0].distancia_km).toBe(12.5)
  })

  it('parada só-API (fora da janela do PDF) é mantida', () => {
    const pdf = [resumoVeiculo()]
    const api = [resumoVeiculo({
      paradas: [parada({
        chegada: new Date('2026-07-15T14:00:00.000Z'), saida: new Date('2026-07-15T14:20:00.000Z'),
        lat: -22.95, lng: -43.25, codigo_loja: '999999', nome_loja: 'OUTRO CLIENTE', distancia_km: null,
      })],
    })]
    const out = mesclarResumosPdfApi(pdf, api)
    expect(out[0].paradas).toHaveLength(2)
    expect(out[0].qtd_paradas).toBe(2)
  })

  it('placa que só aparece na API entra como está', () => {
    const api = [resumoVeiculo({ placa_norm: 'ZZZ9Z99', paradas: [parada({ placa_norm: 'ZZZ9Z99' })] })]
    const out = mesclarResumosPdfApi([], api)
    expect(out).toHaveLength(1)
    expect(out[0].placa_norm).toBe('ZZZ9Z99')
  })

  it('placa que só aparece no PDF fica igual (sem API pra essa placa)', () => {
    const pdf = [resumoVeiculo()]
    const out = mesclarResumosPdfApi(pdf, [])
    expect(out).toEqual(pdf)
  })
})
