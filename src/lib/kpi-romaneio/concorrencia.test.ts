import { describe, it, expect } from 'vitest'
import { mapComLimite } from './concorrencia'

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('mapComLimite', () => {
  it('nunca passa do limite de chamadas simultâneas e mantém a ordem dos resultados', async () => {
    let ativas = 0
    let pico = 0
    const r = await mapComLimite([1, 2, 3, 4, 5, 6, 7, 8], 3, async n => {
      ativas++
      pico = Math.max(pico, ativas)
      await espera(5 * (9 - n))
      ativas--
      return n * 10
    })
    expect(r).toEqual([10, 20, 30, 40, 50, 60, 70, 80])
    expect(pico).toBe(3)
  })

  it('lista vazia devolve lista vazia', async () => {
    expect(await mapComLimite([], 4, async () => 1)).toEqual([])
  })

  it('limite maior que a lista roda tudo e passa o índice', async () => {
    expect(await mapComLimite(['a', 'b'], 10, async (x, i) => `${x}${i}`)).toEqual(['a0', 'b1'])
  })

  it('propaga o erro de uma tarefa', async () => {
    await expect(mapComLimite([1, 2, 3], 2, async n => { if (n === 2) throw new Error('boom'); return n })).rejects.toThrow('boom')
  })
})
