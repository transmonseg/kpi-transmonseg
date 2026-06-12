import { describe, it, expect } from 'vitest'
import { parseAlvos, confirmaPorAlvo } from './alvos'

// Forma crua da API (campos reais de /mapa_servicos/alvos, dados de 12/06).
const raw = {
  alvos: [
    { placa: 'RJN-9F68', pontoidentificador: '8590555', pontonome: 'PRINCESA FONSECA', alvosituacaoservico: 1, alvodatarealizado: '2026-06-12T06:55:34', alvodocumento: '607174' },
    { placa: 'RJN-9F68', pontoidentificador: '8590555', pontonome: 'PRINCESA FONSECA', alvosituacaoservico: 1, alvodatarealizado: '2026-06-12T06:55:34', alvodocumento: '193424' },
    { placa: 'RJN-9F68', pontoidentificador: '7000710', pontonome: 'PREZUNIC CAMPO GRANDE', alvosituacaoservico: 1, alvodatarealizado: '2026-06-12T16:19:21', alvodocumento: '282815' },
    // pendente, sem data real (0001) → não conta como feito
    { placa: 'LKR-5990', pontoidentificador: '7000729', pontonome: 'PREZUNIC MEIER', alvosituacaoservico: 0, alvodatarealizado: '0001-01-01T00:00:00', alvodocumento: '140465' },
  ],
}

describe('parseAlvos', () => {
  it('normaliza placa, número de situação e zera data 0001 como null', () => {
    const alvos = parseAlvos(raw)
    expect(alvos).toHaveLength(4)
    const rjn = alvos[0]
    expect(rjn.placaNorm).toBe('RJN9F68')
    expect(rjn.codigoUnitrac).toBe('8590555')
    expect(rjn.situacao).toBe(1)
    expect(rjn.feitoISO).toBe('2026-06-12T06:55:34')
    expect(rjn.documento).toBe('607174')
    const lkr = alvos[3]
    expect(lkr.situacao).toBe(0)
    expect(lkr.feitoISO).toBeNull() // 0001 → null
  })

  it('aceita resposta vazia/ inválida sem quebrar', () => {
    expect(parseAlvos(null)).toEqual([])
    expect(parseAlvos({})).toEqual([])
  })
})

describe('confirmaPorAlvo', () => {
  const alvos = parseAlvos(raw)

  it('confirma entrega FEITA com hora e todas as notas fiscais da loja', () => {
    const c = confirmaPorAlvo('RJN9F68', '8590555', alvos)
    expect(c).not.toBeNull()
    expect(c!.feitoISO).toBe('2026-06-12T06:55:34')
    expect(c!.notas).toEqual(['607174', '193424']) // dedup por loja
  })

  it('resgata a 2ª entrega da tarde (Campo Grande 16:19)', () => {
    const c = confirmaPorAlvo('RJN9F68', '7000710', alvos)
    expect(c!.feitoISO).toBe('2026-06-12T16:19:21')
    expect(c!.notas).toEqual(['282815'])
  })

  it('NÃO confirma alvo pendente (sit=0) — positivo-só', () => {
    expect(confirmaPorAlvo('LKR5990', '7000729', alvos)).toBeNull()
  })

  it('sem alvo para a loja → null', () => {
    expect(confirmaPorAlvo('RJN9F68', '9999999', alvos)).toBeNull()
  })
})
