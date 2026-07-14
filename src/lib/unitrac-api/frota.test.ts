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

  it('sem argumento, consulta a conta do Benassi (codUser 4586)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ veiculos: [] }), { status: 200 }),
    )
    await buscarFrota()
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://datalayer.portalunitrac.com/veiculos/masn/4586',
      expect.anything(),
    )
  })

  it('com codUser explícito, consulta a conta certa (Nutrimax)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ veiculos: [{ cv: 18870, placa: 'TTL-7D40' }] }), { status: 200 }),
    )
    const r = await buscarFrota('4096')
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://datalayer.portalunitrac.com/veiculos/masn/4096',
      expect.anything(),
    )
    expect(r).toEqual([{ cv: '18870', placa: 'TTL-7D40', placaNorm: 'TTL7D40' }])
  })
})

describe('normPlaca', () => {
  it('remove hífen e maiúsculo', () => {
    expect(normPlaca('tul-1c38')).toBe('TUL1C38')
  })
})
