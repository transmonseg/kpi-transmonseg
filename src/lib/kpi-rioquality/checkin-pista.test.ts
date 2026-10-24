// F4-10 (KRQ-13): check-in da Fusion por NF da geração (a mesma chave que o
// KPI usa), no relógio da Unitrac (Brasília mascarado como UTC).
import { describe, it, expect } from 'vitest'
import { checkInsPorNfRQ, checkInComoIsoUnitrac } from './checkin-pista'
import type { EntregaRioQualityCompleta } from './parse-planilhas'

const e = (over: Partial<EntregaRioQualityCompleta>): EntregaRioQualityCompleta => ({
  placaNorm: 'LPH6E20', clienteNome: 'X', cidade: 'RIO DE JANEIRO', uf: 'RJ', destino: 'D', motorista: 'M', rua: 'AVENIDA DAS AMERICAS', bairro: '', ...over,
})
const gab = (dataCheckIn: string | null) => ({ status: 'Entregue', checkIn: !!dataCheckIn, checkOut: !!dataCheckIn, dataCheckIn, dataCheckOut: null, motivoDevolucao: null })

describe('checkInComoIsoUnitrac', () => {
  it('grade da Fusion (20/10, NF 6069736) e relatório de 55 colunas (22/10, NF 5555374)', () => {
    expect(checkInComoIsoUnitrac('2026-10-20 09:29:58')).toBe('2026-10-20T09:29:58.000Z')
    expect(checkInComoIsoUnitrac('23/10/2026 07:03:48')).toBe('2026-10-23T07:03:48.000Z')
  })
  it('vazio ou formato estranho: null', () => {
    expect(checkInComoIsoUnitrac(null)).toBeNull()
    expect(checkInComoIsoUnitrac('--')).toBeNull()
  })
})

describe('checkInsPorNfRQ', () => {
  it('chave = NF da geração (NF real, NF repetida com sufixo); sem check-in fica fora', () => {
    const m = checkInsPorNfRQ([
      e({ nf: '6069736', gabarito: gab('2026-10-20 09:29:58') }),
      e({ nf: '6069736', gabarito: gab('2026-10-20 13:20:11') }),
      e({ nf: '6071544', gabarito: gab(null) }),
      e({ nf: '6071545' }),
    ])
    expect([...m]).toEqual([['6069736', '2026-10-20T09:29:58.000Z'], ['6069736-2', '2026-10-20T13:20:11.000Z']])
  })
})
