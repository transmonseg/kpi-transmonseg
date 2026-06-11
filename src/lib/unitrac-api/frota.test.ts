import { describe, it, expect, vi, afterEach } from 'vitest'
import { buscarFrota, normPlaca } from './frota'

afterEach(() => vi.restoreAllMocks())

describe('buscarFrota', () => {
  it('mapeia veiculos para {cv, placa, placaNorm}', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ veiculos: [{ cv: 18594, placa: 'TUL-1C38', gvn: 'X' }] }), { status: 200 }),
    )
    const f = await buscarFrota()
    expect(f).toEqual([{ cv: '18594', placa: 'TUL-1C38', placaNorm: 'TUL1C38' }])
  })

  it('retorna [] quando a API cai', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))
    expect(await buscarFrota()).toEqual([])
  })
})

describe('normPlaca', () => {
  it('remove hífen e maiúsculo', () => {
    expect(normPlaca('tul-1c38')).toBe('TUL1C38')
  })
})
