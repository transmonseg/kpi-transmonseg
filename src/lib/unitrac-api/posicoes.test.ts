import { describe, it, expect, vi, afterEach } from 'vitest'
import { buscarPosicoes } from './posicoes'

afterEach(() => vi.restoreAllMocks())

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
