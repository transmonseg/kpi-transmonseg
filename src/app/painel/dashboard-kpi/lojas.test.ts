import { describe, it, expect } from 'vitest'
import { fmtHora, serieHoras, faixasTempo } from './lojas'

describe('dashboard do cliente: lojas e horários', () => {
  it('fmtHora: minutos desde 00:00 viram HH:MM', () => {
    expect(fmtHora(462)).toBe('07:42')
    expect(fmtHora(910.4)).toBe('15:10')
    expect(fmtHora(null)).toBe('—')
  })
  it('serieHoras preenche hora sem entrega e ignora madrugada perdida', () => {
    const s = serieHoras([{ hora: 0, entregas: 2 }, { hora: 7, entregas: 10 }, { hora: 9, entregas: 4 }])
    expect(s[0]).toEqual({ hora: 6, entregas: 0 })
    expect(s.find(h => h.hora === 8)).toEqual({ hora: 8, entregas: 0 })
    expect(s.at(-1)?.hora).toBe(18)
    expect(s.some(h => h.hora === 0)).toBe(false)
  })
  it('serieHoras estende quando há entrega às 20h', () => {
    expect(serieHoras([{ hora: 20, entregas: 3 }]).at(-1)).toEqual({ hora: 20, entregas: 3 })
  })
  it('faixasTempo mantém a ordem e os valores', () => {
    const f = faixasTempo({ ate10: 5, de10a20: 4, de20a30: 3, de30a60: 2, acima60: 1 })
    expect(f.map(x => x.value)).toEqual([5, 4, 3, 2, 1])
  })
})
