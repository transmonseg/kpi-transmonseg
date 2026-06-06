import { describe, expect, it } from 'vitest'
import { mapLimitSettled } from './map-limit'

describe('mapLimitSettled', () => {
  it('limita a concorrencia e preserva ordem dos resultados', async () => {
    let running = 0
    let maxRunning = 0

    const result = await mapLimitSettled([1, 2, 3, 4], 2, async (n) => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise(resolve => setTimeout(resolve, 5))
      running--
      return n * 10
    })

    expect(maxRunning).toBeLessThanOrEqual(2)
    expect(result.map(r => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled'])
    expect(result.map(r => r.status === 'fulfilled' ? r.value : null)).toEqual([10, 20, 30, 40])
  })

  it('retorna rejected sem interromper os outros itens', async () => {
    const result = await mapLimitSettled([1, 2, 3], 1, async (n) => {
      if (n === 2) throw new Error('falha 2')
      return n
    })

    expect(result[0]).toMatchObject({ status: 'fulfilled', value: 1 })
    expect(result[1].status).toBe('rejected')
    expect(result[2]).toMatchObject({ status: 'fulfilled', value: 3 })
  })
})
