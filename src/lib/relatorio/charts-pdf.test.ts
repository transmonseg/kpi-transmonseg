import { describe, it, expect } from 'vitest'
import { segmentos } from './charts-pdf'

describe('segmentos', () => {
  it('reparte a largura proporcionalmente e fecha com o total', () => {
    expect(segmentos([1, 1, 2], 100)).toEqual([25, 25, 50])
    expect(segmentos([3, 1], 80).reduce((a, b) => a + b, 0)).toBeCloseTo(80)
  })
  it('total zero ou vazio não quebra (sem divisão por zero)', () => {
    expect(segmentos([0, 0, 0], 100)).toEqual([0, 0, 0])
    expect(segmentos([], 100)).toEqual([])
  })
})
