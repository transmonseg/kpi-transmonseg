import { describe, it, expect } from 'vitest'
import { partitionSettled } from './partition-settled'

describe('U4 — partitionSettled', () => {
  it('separa fulfilled de rejected mantendo a chave correspondente', () => {
    const settled: PromiseSettledResult<string>[] = [
      { status: 'fulfilled', value: 'A_OK' },
      { status: 'rejected', reason: new Error('boom B') },
      { status: 'fulfilled', value: 'C_OK' },
    ]
    const { ok, falhas } = partitionSettled(settled, ['A', 'B', 'C'])
    expect(ok).toEqual(['A_OK', 'C_OK'])
    expect(falhas).toEqual([{ key: 'B', erro_mensagem: 'boom B' }])
  })

  it('falhas com reason string', () => {
    const settled: PromiseSettledResult<number>[] = [
      { status: 'rejected', reason: 'erro literal' },
    ]
    const { ok, falhas } = partitionSettled(settled, ['X'])
    expect(ok).toEqual([])
    expect(falhas).toEqual([{ key: 'X', erro_mensagem: 'erro literal' }])
  })

  it('todas OK: ok cheio, falhas vazio', () => {
    const settled: PromiseSettledResult<number>[] = [
      { status: 'fulfilled', value: 1 },
      { status: 'fulfilled', value: 2 },
    ]
    const { ok, falhas } = partitionSettled(settled, ['a', 'b'])
    expect(ok).toEqual([1, 2])
    expect(falhas).toEqual([])
  })

  it('todas falham: ok vazio, falhas cheio', () => {
    const settled: PromiseSettledResult<number>[] = [
      { status: 'rejected', reason: new Error('e1') },
      { status: 'rejected', reason: new Error('e2') },
    ]
    const { ok, falhas } = partitionSettled(settled, ['k1', 'k2'])
    expect(ok).toEqual([])
    expect(falhas).toEqual([
      { key: 'k1', erro_mensagem: 'e1' },
      { key: 'k2', erro_mensagem: 'e2' },
    ])
  })

  it('throw quando arrays tem tamanhos diferentes', () => {
    const settled: PromiseSettledResult<number>[] = [{ status: 'fulfilled', value: 1 }]
    expect(() => partitionSettled(settled, ['a', 'b'])).toThrow(/settled.length/)
  })
})
