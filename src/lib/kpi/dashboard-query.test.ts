import { describe, it, expect } from 'vitest'
import { intervaloPeriodo, intervaloAnterior } from './dashboard-query'

describe('intervaloPeriodo', () => {
  it('ano = jan a dez', () => expect(intervaloPeriodo('ano', '2026-05-21')).toEqual(['2026-01-01', '2026-12-31']))
  it('mes', () => expect(intervaloPeriodo('mes', '2026-05-21')).toEqual(['2026-05-01', '2026-05-31']))
  it('dia', () => expect(intervaloPeriodo('dia', '2026-05-21')).toEqual(['2026-05-21', '2026-05-21']))
})
describe('intervaloAnterior', () => {
  it('mes anterior', () => expect(intervaloAnterior('mes', '2026-05-21')).toEqual(['2026-04-01', '2026-04-30']))
  it('dia anterior', () => expect(intervaloAnterior('dia', '2026-05-21')).toEqual(['2026-05-20', '2026-05-20']))
  it('ano anterior', () => expect(intervaloAnterior('ano', '2026-05-21')).toEqual(['2025-01-01', '2025-12-31']))
})
