import { describe, it, expect } from 'vitest'
import { mesclarParadas } from './merge-paradas'
import type { UnitracParadaRow } from './matcher'

const p = (id: string, placa: string, chegada: string, lat: number, lng: number, classificacao = 'FORA_BASE'): UnitracParadaRow => ({
  id, placa_norm: placa, chegada, saida: chegada, duracao_seg: 0, local_parada: '', codigo_loja: null, nome_loja: null,
  lat, lng, endereco: null, classificacao, ordem: 1,
})

describe('mesclarParadas (PDF base + API preenche)', () => {
  it('descarta parada da API que duplica uma do PDF (≤200m e ≤20min, mesma placa)', () => {
    const pdf = [p('pdf1', 'FUM8748', '2026-06-13T05:51:00Z', -22.90316, -43.11053)]
    const api = [p('api1', 'FUM8748', '2026-06-13T05:51:36Z', -22.90327, -43.11062)] // ~15m, 36s → dup
    const out = mesclarParadas(pdf, api)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('pdf1') // o do PDF manda
  })

  it('ADICIONA parada da API que o PDF não tem (entrega da tarde que o relatório cedo perdeu)', () => {
    const pdf = [p('pdf1', 'RJN9F68', '2026-06-13T05:44:00Z', -22.90327, -43.11062)]
    const api = [
      p('api1', 'RJN9F68', '2026-06-13T05:44:30Z', -22.90327, -43.11062), // dup do pdf
      p('api2', 'RJN9F68', '2026-06-13T16:19:00Z', -22.87, -43.55),        // tarde, longe → nova
    ]
    const out = mesclarParadas(pdf, api)
    expect(out.map(x => x.id).sort()).toEqual(['api2', 'pdf1'])
  })

  it('placa diferente nunca é duplicata', () => {
    const pdf = [p('pdf1', 'AAA0000', '2026-06-13T05:51:00Z', -22.903, -43.110)]
    const api = [p('api1', 'BBB1111', '2026-06-13T05:51:00Z', -22.903, -43.110)]
    expect(mesclarParadas(pdf, api)).toHaveLength(2)
  })

  it('parada API sem coordenada é mantida (não dá pra deduplicar)', () => {
    const pdf = [p('pdf1', 'FUM8748', '2026-06-13T05:51:00Z', -22.903, -43.110)]
    const api = [{ ...p('api1', 'FUM8748', '2026-06-13T05:51:00Z', 0, 0), lat: null, lng: null }]
    expect(mesclarParadas(pdf, api)).toHaveLength(2)
  })
})
