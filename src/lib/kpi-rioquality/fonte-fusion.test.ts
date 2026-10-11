import { describe, it, expect, vi } from 'vitest'
import romaneios from '../fusion/__fixtures__/romaneios.json'
import entregas from '../fusion/__fixtures__/entregas.json'
import { mapearEntregasFusion, buscarDiaRioQualityFusion } from './fonte-fusion'
import type { RomaneioFusion, EntregaFusionRaw } from '../fusion/tipos'

vi.mock('../fusion/entregas', () => ({ buscarEntregasDoDia: vi.fn(async () => ({ romaneios: [], entregas: [] })) }))

describe('mapearEntregasFusion', () => {
  const linhas = mapearEntregasFusion(romaneios.rows as RomaneioFusion[], entregas.rows as EntregaFusionRaw[])

  it('produz uma linha por entrega', () => expect(linhas).toHaveLength(4))

  it('casa romaneio -> placa/motorista/cliente/cidade', () => {
    const l = linhas[0]
    expect(l.placaNorm).toBe('KOB3H38')
    expect(l.motorista).toBe('DAVIDSON MESQUITA SILVA')
    expect(l.clienteNome).toBe('BANG 2024 REST E LANC LTDA')
    expect(l.cidade).toBe('RIO DE JANEIRO')
  })

  it('nf = pedido ERP (id estavel)', () => {
    expect(linhas[0].nf).toBe('6052562')
    expect(linhas.find(l => l.clienteNome.includes('DEVOLVIDO'))!.nf).toBe('6059999')
  })

  it('entregue -> gabarito Entregue com check-in/out', () => {
    const g = linhas[0].gabarito!
    expect(g.status).toBe('Entregue')
    expect(g.checkIn).toBe(true)
    expect(g.checkOut).toBe(true)
    expect(g.dataCheckIn).toBe('2026-10-10 10:14:44')
  })

  it('devolucao -> gabarito Devolvido sem check-out', () => {
    const dev = linhas.find(l => l.clienteNome.includes('DEVOLVIDO'))!
    expect(dev.gabarito!.status).toBe('Devolvido')
    expect(dev.gabarito!.checkOut).toBe(false)
  })
})

describe('buscarDiaRioQualityFusion', () => {
  it('dia sem romaneios devolve lista vazia', async () => {
    expect(await buscarDiaRioQualityFusion('2026-10-10')).toEqual([])
  })
})
