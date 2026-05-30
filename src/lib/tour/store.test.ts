import { describe, it, expect, vi } from 'vitest'
import { getTour, setTour, subTour, iniciarTutorial } from './store'

describe('tour store', () => {
  it('começa inativo no capítulo 0', () => {
    expect(getTour()).toEqual({ ativo: false, cap: 0 })
  })
  it('iniciarTutorial ativa no capítulo 0 e notifica', () => {
    const fn = vi.fn()
    const unsub = subTour(fn)
    setTour({ ativo: false, cap: 5 })
    iniciarTutorial()
    expect(getTour()).toEqual({ ativo: true, cap: 0 })
    expect(fn).toHaveBeenCalled()
    unsub()
  })
  it('setTour faz merge parcial', () => {
    setTour({ ativo: true, cap: 0 })
    setTour({ cap: 2 })
    expect(getTour()).toEqual({ ativo: true, cap: 2 })
  })
})
