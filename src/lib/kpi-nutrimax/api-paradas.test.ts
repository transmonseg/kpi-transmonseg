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

import { buscarResumosViagemViaApi } from './api-paradas'

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
