import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = mocks.eq
    return { from: () => q }
  },
}))

import {
  placasSemRastreadorNoDia,
  buscarPlacasSemRastreador,
  montarTemRastreadorPorPlaca,
  type PlacaSemRastreadorRow,
} from './placas-sem-rastreador'

const linha = (o: Partial<PlacaSemRastreadorRow>): PlacaSemRastreadorRow => ({
  id: 1, empresa: 'NUTRY MAX', placa: 'TTL5J17', inicio: '2026-09-23', fim: null,
  motivo: 'informado pela operação 24/09', responsavel: 'Ana', criado_em: '2026-09-24T10:00:00Z', ...o,
})

describe('placasSemRastreadorNoDia', () => {
  it('antes do inicio: nao conta', () => {
    const s = placasSemRastreadorNoDia([linha({ inicio: '2026-09-23' })], '2026-09-22')
    expect(s.has('TTL5J17')).toBe(false)
  })

  it('dentro da vigencia (fim null): conta', () => {
    const s = placasSemRastreadorNoDia([linha({ inicio: '2026-09-23', fim: null })], '2026-09-24')
    expect(s.has('TTL5J17')).toBe(true)
  })

  it('no dia exato do inicio: conta', () => {
    const s = placasSemRastreadorNoDia([linha({ inicio: '2026-09-23', fim: null })], '2026-09-23')
    expect(s.has('TTL5J17')).toBe(true)
  })

  it('depois do fim: nao conta', () => {
    const s = placasSemRastreadorNoDia([linha({ inicio: '2026-09-23', fim: '2026-09-25' })], '2026-09-26')
    expect(s.has('TTL5J17')).toBe(false)
  })

  it('no dia exato do fim: ainda conta', () => {
    const s = placasSemRastreadorNoDia([linha({ inicio: '2026-09-23', fim: '2026-09-25' })], '2026-09-25')
    expect(s.has('TTL5J17')).toBe(true)
  })

  it('normaliza a placa (minusculas/traço)', () => {
    const s = placasSemRastreadorNoDia([linha({ placa: 'ttl-5j17' })], '2026-09-24')
    expect(s.has('TTL5J17')).toBe(true)
  })
})

describe('buscarPlacasSemRastreador', () => {
  beforeEach(() => mocks.eq.mockReset())

  it('devolve as linhas da empresa', async () => {
    mocks.eq.mockResolvedValue({ data: [linha({})], error: null })
    const r = await buscarPlacasSemRastreador('NUTRY MAX')
    expect(r).toHaveLength(1)
    expect(r[0].placa).toBe('TTL5J17')
  })

  it('erro de leitura nao quebra: devolve vazio', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.eq.mockResolvedValue({ data: null, error: { message: 'tabela nao existe' } })
    await expect(buscarPlacasSemRastreador('NUTRY MAX')).resolves.toEqual([])
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('montarTemRastreadorPorPlaca', () => {
  it('placa declarada sem rastreador vence "VEICULO SEM MOVIMENTO": tem cv E ponte, mesmo assim sai false', () => {
    // Caso real TTL5J17: tem `cv` na Unitrac e a ponte respondeu (paradas so' na
    // BASE) -- pelo dado seria "veiculo parado", nao "sem rastreador". A
    // declaracao manual da operacao vence as duas fontes.
    const cvPorPlaca = new Map([['TTL5J17', 'cv-1']])
    const horarioBasePorPlaca = new Map([['TTL5J17', { paradas: [] }]])
    const semRastreador = new Set(['TTL5J17'])
    const r = montarTemRastreadorPorPlaca(['TTL5J17'], cvPorPlaca, horarioBasePorPlaca, semRastreador)
    expect(r.get('TTL5J17')).toBe(false)
  })

  it('placa nao declarada: mantem o calculo de cv/ponte de sempre', () => {
    const cvPorPlaca = new Map([['AAA1A11', 'cv-2']])
    const horarioBasePorPlaca = new Map<string, unknown>()
    const r = montarTemRastreadorPorPlaca(['AAA1A11', 'BBB2B22'], cvPorPlaca, horarioBasePorPlaca, new Set())
    expect(r.get('AAA1A11')).toBe(true)
    expect(r.get('BBB2B22')).toBe(false)
  })
})
