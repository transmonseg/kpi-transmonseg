import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
import { periodoValido } from './relatorio-ordem-rota-servidor'

describe('periodoValido (tela Ordem da rota)', () => {
  const hoje = '2026-11-12'
  it('sem datas = hoje; só "de" = um dia', () => {
    expect(periodoValido(null, null, hoje)).toEqual({ de: hoje, ate: hoje })
    expect(periodoValido('2026-11-10', null, hoje)).toEqual({ de: '2026-11-10', ate: '2026-11-10' })
  })
  it('recusa invertido, futuro, formato e mais de 62 dias', () => {
    expect(periodoValido('2026-11-12', '2026-11-10', hoje)).toMatch(/depois do fim/)
    expect(periodoValido('2026-11-12', '2026-11-13', hoje)).toMatch(/hoje/)
    expect(periodoValido('12/11/2026', null, hoje)).toMatch(/inválida/)
    expect(periodoValido('2026-09-01', hoje, hoje)).toMatch(/62/)
    expect(periodoValido('2026-09-12', hoje, hoje)).toEqual({ de: '2026-09-12', ate: hoje })
  })
})
