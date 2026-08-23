import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buscarAlvosDoDia, buscarParadasDoDia } from './unitrac'
import { BASES_COORD_NUTRIMAX } from './constants'

const { buscarFrotaMock, buscarAlvosMock, buscarStopsCruMock, consolidaParadasApiMock } = vi.hoisted(() => ({
  buscarFrotaMock: vi.fn(),
  buscarAlvosMock: vi.fn(),
  buscarStopsCruMock: vi.fn(),
  consolidaParadasApiMock: vi.fn(),
}))

vi.mock('@/lib/unitrac-api', () => ({
  buscarFrota: buscarFrotaMock,
  buscarAlvos: buscarAlvosMock,
  buscarStopsCru: buscarStopsCruMock,
  consolidaParadasApi: consolidaParadasApiMock,
}))

beforeEach(() => {
  buscarFrotaMock.mockReset()
  buscarAlvosMock.mockReset()
  buscarStopsCruMock.mockReset()
  consolidaParadasApiMock.mockReset()
})

describe('buscarAlvosDoDia', () => {
  it('filtra a frota certa pelas placas pedidas e busca alvos só dos cv correspondentes', async () => {
    buscarFrotaMock.mockResolvedValue([
      { cv: '111', placa: 'TUL-1C38', placaNorm: 'TUL1C38' },
      { cv: '222', placa: 'TUI-1A90', placaNorm: 'TUI1A90' },
      { cv: '333', placa: 'ABC-9999', placaNorm: 'ABC9999' },
    ])
    buscarAlvosMock.mockResolvedValue([{ placaNorm: 'TUL1C38' }])

    const r = await buscarAlvosDoDia(['TUL1C38'])

    expect(buscarFrotaMock).toHaveBeenCalled()
    expect(buscarAlvosMock).toHaveBeenCalledWith(['111'])
    expect(r).toEqual([{ placaNorm: 'TUL1C38' }])
  })

  it('placa sem correspondencia na frota nao gera cv e nao quebra (retorna [] sem chamar buscarAlvos)', async () => {
    buscarFrotaMock.mockResolvedValue([
      { cv: '111', placa: 'TUL-1C38', placaNorm: 'TUL1C38' },
    ])

    const r = await buscarAlvosDoDia(['ZZZ0000'])

    expect(r).toEqual([])
    expect(buscarAlvosMock).not.toHaveBeenCalled()
  })
})

describe('buscarParadasDoDia', () => {
  it('busca stops crus e consolida com pontos={} e as duas bases da Nutrimax', async () => {
    const eventos = [{ _data: '2026-08-20T10:00:00', tempoparada: 60, latitude: -22.8, longitude: -43.2 }]
    buscarStopsCruMock.mockResolvedValue(eventos)
    consolidaParadasApiMock.mockReturnValue([{ id: 'x' }])

    const r = await buscarParadasDoDia('111', 'TUL1C38', '2026-08-20', 48)

    expect(buscarStopsCruMock).toHaveBeenCalledWith('111', 48)
    expect(consolidaParadasApiMock).toHaveBeenCalledWith(eventos, {}, '2026-08-20', 'TUL1C38', BASES_COORD_NUTRIMAX)
    expect(r).toEqual([{ id: 'x' }])
  })
})
