import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
import { dentroDoLink } from './dashboard-link'

describe('dentroDoLink', () => {
  const l = { de: '2026-11-25', ate: '2026-11-25' }
  it('aceita o próprio dia', () => expect(dentroDoLink(l, '2026-11-25', '2026-11-25')).toBe(true))
  it('recusa dia anterior ou intervalo maior', () => {
    expect(dentroDoLink(l, '2026-11-24', '2026-11-24')).toBe(false)
    expect(dentroDoLink(l, '2026-11-24', '2026-11-25')).toBe(false)
    expect(dentroDoLink(l, '2026-11-25', '2026-11-26')).toBe(false)
  })
  it('aceita pedaço de um período', () => expect(dentroDoLink({ de: '2026-11-01', ate: '2026-11-30' }, '2026-11-10', '2026-11-12')).toBe(true))
  it('recusa intervalo invertido', () => expect(dentroDoLink({ de: '2026-11-01', ate: '2026-11-30' }, '2026-11-12', '2026-11-10')).toBe(false))
})
