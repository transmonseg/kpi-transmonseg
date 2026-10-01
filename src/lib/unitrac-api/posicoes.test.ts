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

// Relatorio 01/10: a variante /N/N devolve placa + empresa + datagps de
// QUALQUER CV (a /S/N omite veiculos -- KND2D45, KVU6307, LNH8A80 voltam
// vazios). Indexada por CV.
import { buscarPosicoesPorCv } from './posicoes'
describe('buscarPosicoesPorCv', () => {
  it('chama /posicoes/N/N e indexa por CV com placa normalizada, empresa e datagps', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: true, Posicoes: [
        { veicucodigo: '15277', veicuplaca: 'RJM-5B51', emprecodigo: '598', datagps: '20/08/2026 11:54:21', posiclatitude: '-22.707463', posiclongitude: '-43.313342' },
      ] }), { status: 200 }),
    )
    const m = await buscarPosicoesPorCv(['15277'])
    expect(String(spy.mock.calls[0][0])).toContain('/mapa_servicos/posicoes/N/N')
    expect(m.get('15277')).toEqual({ cv: '15277', placa: 'RJM5B51', empresa: '598', datagps: '20/08/2026 11:54:21', lat: -22.707463, lng: -43.313342 })
  })
  it('lotes de ate 500 CVs por chamada', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ Posicoes: [] }), { status: 200 }))
    await buscarPosicoesPorCv(Array.from({ length: 1001 }, (_, i) => String(i + 1)))
    expect(spy).toHaveBeenCalledTimes(3)
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body))).toHaveLength(500)
  })
  it('falha da API lanca (quem chama decide: descoberta para, geracao segue sem o dado)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x', { status: 500 }))
    await expect(buscarPosicoesPorCv(['1'])).rejects.toThrow()
  })
})
