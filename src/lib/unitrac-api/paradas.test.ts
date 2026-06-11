import { describe, it, expect, vi, afterEach } from 'vitest'
import { buscarParadas } from './paradas'
import { buscarPosicoes } from './posicoes'

afterEach(() => vi.restoreAllMocks())

describe('buscarParadas', () => {
  it('mapeia paradas relevantes (>= 120s)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ paradas: [
        { _data: '2026-06-11T09:00:00Z', tempoparada: 600, latitude: -22.9, longitude: -43.2 },
        { _data: '2026-06-11T09:30:00Z', tempoparada: 30, latitude: -22.9, longitude: -43.2 },
      ] }), { status: 200 }),
    )
    const ps = await buscarParadas('18594', 48)
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ inicioISO: '2026-06-11T09:00:00Z', duracaoSeg: 600 })
  })

  it('retorna [] quando a API cai', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))
    expect(await buscarParadas('1', 48)).toEqual([])
  })
})

describe('buscarPosicoes', () => {
  it('indexa por placa normalizada com velocidade', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ Posicoes: [
        { veicucodigo: '18594', veicuplaca: 'TUL-1C38', posicvelocidade: '40', posicignicao: '1', datagps: '11/06/2026 09:00:00' },
      ] }), { status: 200 }),
    )
    const m = await buscarPosicoes(['18594'])
    expect(m['TUL1C38']).toMatchObject({ velocidade: 40, ignicao: true })
  })
})
