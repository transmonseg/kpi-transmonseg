import { describe, it, expect } from 'vitest'
import { calcularKmPercorrido } from './km'
import { haversine } from '@/lib/utils/geo'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

function parada(overrides: Partial<UnitracParadaRow> = {}): UnitracParadaRow {
  return {
    id: 'p1',
    placa_norm: 'ABC1234',
    chegada: '2026-08-20T10:00:00.000Z',
    saida: '2026-08-20T10:10:00.000Z',
    fim_real: '2026-08-20T10:10:00.000Z',
    duracao_seg: 600,
    local_parada: 'FORA DE BASE',
    codigo_loja: null,
    nome_loja: null,
    lat: -22.9,
    lng: -43.2,
    endereco: null,
    classificacao: 'FORA_BASE',
    ordem: 1,
    ...overrides,
  }
}

describe('calcularKmPercorrido', () => {
  it('soma a distancia haversine entre paradas GPS consecutivas (ordenadas por `ordem`)', () => {
    const p1 = parada({ ordem: 1, lat: -22.816007, lng: -43.277827 })
    const p2 = parada({ ordem: 2, lat: -22.9, lng: -43.3 })
    const p3 = parada({ ordem: 3, lat: -22.95, lng: -43.35 })

    const esperadoMetros =
      haversine(p1.lat as number, p1.lng as number, p2.lat as number, p2.lng as number) +
      haversine(p2.lat as number, p2.lng as number, p3.lat as number, p3.lng as number)

    const r = calcularKmPercorrido([p1, p2, p3])
    expect(r).toBeCloseTo(esperadoMetros / 1000, 6)
  })

  it('respeita a ordem de `ordem`, nao a ordem de insercao no array', () => {
    const p1 = parada({ ordem: 1, lat: -22.816007, lng: -43.277827 })
    const p2 = parada({ ordem: 2, lat: -22.9, lng: -43.3 })

    const emOrdem = calcularKmPercorrido([p1, p2])
    const foraDeOrdem = calcularKmPercorrido([p2, p1])
    expect(foraDeOrdem).toBeCloseTo(emOrdem as number, 9)
  })

  it('ignora paradas sem coordenada', () => {
    const p1 = parada({ ordem: 1, lat: -22.816007, lng: -43.277827 })
    const semCoord = parada({ ordem: 2, lat: null, lng: null })
    const p3 = parada({ ordem: 3, lat: -22.9, lng: -43.3 })

    const comBuraco = calcularKmPercorrido([p1, semCoord, p3])
    const direto = calcularKmPercorrido([p1, p3])
    expect(comBuraco).toBeCloseTo(direto as number, 9)
  })

  it('devolve null (nao zero) com menos de 2 paradas com coordenada -- "sem dado" != "km zero"', () => {
    expect(calcularKmPercorrido([])).toBeNull()
    expect(calcularKmPercorrido([parada({ lat: -22.9, lng: -43.3 })])).toBeNull()
    expect(calcularKmPercorrido([parada({ lat: null, lng: null }), parada({ lat: null, lng: null })])).toBeNull()
  })
})
