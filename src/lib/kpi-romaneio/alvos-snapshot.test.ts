import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mesclarAlvos, alvosEfetivos } from './alvos-snapshot'

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
  feitoISO: null, documento: '100', inicioISO: '2026-09-17T06:00:00', ordem: 1, rota: 'R1', ...o,
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
  it('une alvos de chaves diferentes', () => {
    expect(mesclarAlvos([alvo({ documento: '1' })], [alvo({ documento: '2' })])).toHaveLength(2)
  })
})

describe('alvosEfetivos', () => {
  beforeEach(() => {
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
