import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mesclarAlvos, alvosEfetivos, agruparAlvosPorDia } from './alvos-snapshot'

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  maybeSingle: vi.fn(),
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.maybeSingle = mocks.maybeSingle
    q.upsert = mocks.upsert
    return { from: () => q }
  },
}))
import type { AlvoApi } from '@/lib/unitrac-api'

const alvo = (o: Partial<AlvoApi>): AlvoApi => ({
  placaNorm: 'AAA1A11', codigoUnitrac: 'L1', nome: 'Loja', situacao: 0,
  feitoISO: null, documento: '100', inicioISO: '2026-09-17T06:00:00', ordem: 1, rota: 'R1',
  pontoLat: null, pontoLng: null, ...o,
})

describe('mesclarAlvos', () => {
  it('feito nunca volta a pendente', () => {
    const r = mesclarAlvos([alvo({ situacao: 1, feitoISO: '2026-09-17T09:00:00' })], [alvo({ situacao: 0 })])
    expect(r).toHaveLength(1)
    expect(r[0].situacao).toBe(1)
  })
  it('pendente antigo vira feito quando o novo confirma', () => {
    const r = mesclarAlvos([alvo({ situacao: 0 })], [alvo({ situacao: 1, feitoISO: '2026-09-17T10:00:00' })])
    expect(r[0].situacao).toBe(1)
  })
  it('ordem mudou entre capturas: o feito fica por ultimo e vence no Map last-wins por NF', () => {
    const r = mesclarAlvos(
      [alvo({ situacao: 1, ordem: 1, feitoISO: '2026-09-17T09:00:00' })],
      [alvo({ situacao: 0, ordem: 2 })],
    )
    const alvoPorNf = new Map(r.filter(a => a.documento).map(a => [a.documento, a]))
    expect(alvoPorNf.get('100')?.situacao).toBe(1)
  })
  it('une alvos de chaves diferentes', () => {
    expect(mesclarAlvos([alvo({ documento: '1' })], [alvo({ documento: '2' })])).toHaveLength(2)
  })
})

describe('alvosEfetivos', () => {
  let log: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.upsert.mockClear()
    mocks.maybeSingle.mockClear()
    mocks.upsert.mockResolvedValue({ error: null })
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
  })

  it('data >= hoje com alvos: grava snapshot e devolve a API', async () => {
    const daApi = [alvo({})]
    const r = await alvosEfetivos('nutrimax', '2026-09-18', '2026-09-18', daApi)
    expect(mocks.upsert).toHaveBeenCalledTimes(1)
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ cliente: 'nutrimax', data_referencia: '2026-09-18', qtd_alvos: 1 })
    expect(r).toBe(daApi)
  })

  it('hoje com API vazia: devolve o snapshot em vez de vazio', async () => {
    const snap = [alvo({ situacao: 1, feitoISO: '2026-09-18T09:00:00' })]
    mocks.maybeSingle.mockResolvedValue({ data: { alvos: snap }, error: null })
    const r = await alvosEfetivos('nutrimax', '2026-09-18', '2026-09-18', [])
    expect(r).toEqual(snap)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('hoje com API vazia e sem snapshot: devolve vazio', async () => {
    const r = await alvosEfetivos('nutrimax', '2026-09-18', '2026-09-18', [])
    expect(r).toEqual([])
  })

  it('loga se usou snapshot', async () => {
    const snap = [alvo({ situacao: 1, feitoISO: '2026-09-17T09:00:00' })]
    mocks.maybeSingle.mockResolvedValue({ data: { alvos: snap }, error: null })
    await alvosEfetivos('nutrimax', '2026-09-17', '2026-09-18', [alvo({ documento: '2' })])
    expect(log).toHaveBeenCalledWith('snapshot alvos 2026-09-17: 1 do snapshot + 1 da API')
    log.mockClear()
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    await alvosEfetivos('nutrimax', '2026-09-17', '2026-09-18', [])
    expect(log).toHaveBeenCalledWith('sem snapshot para 2026-09-17')
  })

  it('dia passado com API vazia: devolve o snapshot', async () => {
    const snap = [alvo({ situacao: 1, feitoISO: '2026-09-17T09:00:00' })]
    mocks.maybeSingle.mockResolvedValue({ data: { alvos: snap }, error: null })
    const r = await alvosEfetivos('nutrimax', '2026-09-17', '2026-09-18', [])
    expect(r).toEqual(snap)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('erro do Supabase: devolve a API sem lançar', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const daApi = [alvo({})]
    await expect(alvosEfetivos('nutrimax', '2026-09-17', '2026-09-18', daApi)).resolves.toBe(daApi)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('agruparAlvosPorDia', () => {
  it('agrupa por feitoISO ?? inicioISO e ignora alvos sem data', () => {
    const a = alvo({ documento: '1', feitoISO: '2026-09-17T09:00:00', inicioISO: '2026-09-16T23:00:00' })
    const b = alvo({ documento: '2', inicioISO: '2026-09-17T06:00:00' })
    const c = alvo({ documento: '3', inicioISO: '2026-09-18T06:00:00' })
    const d = alvo({ documento: '4', inicioISO: null })
    const m = agruparAlvosPorDia([a, b, c, d])
    expect([...m.keys()].sort()).toEqual(['2026-09-17', '2026-09-18'])
    expect(m.get('2026-09-17')).toEqual([a, b])
    expect(m.get('2026-09-18')).toEqual([c])
  })
})
