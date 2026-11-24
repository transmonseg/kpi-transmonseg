import { describe, it, expect, vi } from 'vitest'
import { sugerirTrocasRQ } from './sugerir-trocas-rq'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

const M = 1 / 111_195
const parada = (placa: string, lat: number, lng: number, classificacao: 'FORA_BASE' | 'BASE' = 'FORA_BASE') =>
  ({ id: `${placa}-${lat}`, placa_norm: placa, classificacao, lat, lng, chegada: '2026-11-24T09:00:00Z', saida: '2026-11-24T09:05:00Z', fim_real: '2026-11-24T09:05:00Z' }) as unknown as UnitracParadaRow

// 24/11: romaneio 1184782 do SRO9A31 (parado na base) feito pelo KWQ6252, fora da escala.
const geo = [0, 1, 2, 3].map(i => ({ nf: `N${i}`, carga: '1184782', placa: 'SRO9A31', endereco: `RUA ${i}, 10`, lat: -22.98 + i * 2000 * M, lng: -43.22 }))
const frota = new Map([['SRO9A31', 'cv1'], ['KWQ6252', 'cv2'], ['TOS1I21', 'cv3']])

describe('sugerirTrocasRQ', () => {
  it('busca o GPS da frota fora da escala e sugere o carro que fez o romaneio', async () => {
    const buscarParadas = vi.fn(async (_cv: string, placa: string) =>
      placa === 'KWQ6252' ? geo.slice(0, 3).map(e => parada(placa, e.lat, e.lng)) : [])
    const s = await sugerirTrocasRQ('2026-11-24', geo, new Map([['SRO9A31', [parada('SRO9A31', -22.81, -43.27, 'BASE')]]]), { frota, buscarParadas, buscarForaDaEscala: true })
    expect(buscarParadas).toHaveBeenCalledTimes(2)
    expect(s).toEqual([{ carga: '1184782', placaEscala: 'SRO9A31', placaSugerida: 'KWQ6252', enderecosVisitados: 3, enderecosDaCarga: 4, modo: 'redirecionar', motivo: 'livre' }])
  })

  it('escalado fez o romaneio: não busca GPS de mais ninguém', async () => {
    const buscarParadas = vi.fn(async () => [])
    const s = await sugerirTrocasRQ('2026-11-24', geo, new Map([['SRO9A31', geo.map(e => parada('SRO9A31', e.lat, e.lng))]]), { frota, buscarParadas, buscarForaDaEscala: true })
    expect(buscarParadas).not.toHaveBeenCalled()
    expect(s).toEqual([])
  })

  it('dia fora das 48 h: fica só com a escala, sem buscar', async () => {
    const buscarParadas = vi.fn(async () => [])
    const s = await sugerirTrocasRQ('2026-11-01', geo, new Map([['SRO9A31', []]]), { frota, buscarParadas, buscarForaDaEscala: false })
    expect(buscarParadas).not.toHaveBeenCalled()
    expect(s).toEqual([])
  })
})
