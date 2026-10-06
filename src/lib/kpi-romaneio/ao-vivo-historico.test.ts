import { describe, it, expect } from 'vitest'
import { escolherFonteDoDia, diasComHistorico } from './ao-vivo-historico'

describe('escolherFonteDoDia', () => {
  const aoVivo = { calculadoEm: '2026-10-05T22:00:00-03:00' }
  const geracao = { id: 'g1', geradoEm: '2026-10-05T13:40:00-03:00', arquivo: 'nutrimax/2026-10-05/x-kpi.xlsx' }
  it('usa o mais novo: cálculo do ao vivo depois da geração', () => {
    expect(escolherFonteDoDia(aoVivo, geracao)).toBe('ao_vivo')
  })
  it('geração refeita depois do ao vivo (ex.: Ana regerou no dia seguinte) ganha', () => {
    expect(escolherFonteDoDia(aoVivo, { ...geracao, geradoEm: '2026-10-06T09:00:00-03:00' })).toBe('geracao')
  })
  it('só um dos dois, ou nenhum', () => {
    expect(escolherFonteDoDia(null, geracao)).toBe('geracao')
    expect(escolherFonteDoDia(aoVivo, null)).toBe('ao_vivo')
    expect(escolherFonteDoDia(null, null)).toBeNull()
  })
})

describe('diasComHistorico', () => {
  it('junta as datas das duas fontes, sem repetir, mais recente primeiro, sem hoje', () => {
    expect(diasComHistorico(['2026-10-05', '2026-10-06'], ['2026-10-01', '2026-10-05', '2026-10-03'], '2026-10-06'))
      .toEqual(['2026-10-05', '2026-10-03', '2026-10-01'])
  })
})
