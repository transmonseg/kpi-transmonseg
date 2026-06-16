import { describe, it, expect } from 'vitest'
import { parseAlvos, confirmaPorAlvo, inicioRotaPorAlvo } from './alvos'

// Forma crua da API (campos reais de /mapa_servicos/alvos, dados de 12/06).
const raw = {
  alvos: [
    { placa: 'RJN-9F68', pontoidentificador: '8590555', pontonome: 'PRINCESA FONSECA', alvosituacaoservico: 1, alvodatainicio: '2026-06-12T02:51:03', alvodatarealizado: '2026-06-12T06:55:34', alvodocumento: '607174' },
    { placa: 'RJN-9F68', pontoidentificador: '8590555', pontonome: 'PRINCESA FONSECA', alvosituacaoservico: 1, alvodatainicio: '2026-06-12T02:51:03', alvodatarealizado: '2026-06-12T06:55:34', alvodocumento: '193424' },
    { placa: 'RJN-9F68', pontoidentificador: '7000710', pontonome: 'PREZUNIC CAMPO GRANDE', alvosituacaoservico: 1, alvodatainicio: '2026-06-12T13:23:55', alvodatarealizado: '2026-06-12T16:19:21', alvodocumento: '282815' },
    // pendente (rota longa): NÃO feito, mas TEM início (saída CD vem daqui)
    { placa: 'KZU-4C37', pontoidentificador: '560049', pontonome: 'SENDAS ARARUAMA', alvosituacaoservico: 0, alvodatainicio: '2026-06-12T02:48:00', alvodatarealizado: '0001-01-01T00:00:00', alvodocumento: '999' },
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
    expect(rjn.inicioISO).toBe('2026-06-12T02:51:03')
    const kzu = alvos[3]
    expect(kzu.situacao).toBe(0)
    expect(kzu.feitoISO).toBeNull() // 0001 → null
    expect(kzu.inicioISO).toBe('2026-06-12T02:48:00') // início existe mesmo pendente
  })

  it('aceita resposta vazia/ inválida sem quebrar', () => {
    expect(parseAlvos(null)).toEqual([])
    expect(parseAlvos({})).toEqual([])
  })

  it('extrai ordem e rota do alvo (pra distinguir viagem/sequência)', () => {
    const alvos = parseAlvos({ alvos: [
      { placa: 'ABC1D23', pontoidentificador: '111', alvosituacaoservico: 1, alvodatarealizado: '2026-06-12T06:00:00', alvoordem: '3', alvorota: 'ROTA 2' },
    ] })
    expect(alvos[0].ordem).toBe(3)
    expect(alvos[0].rota).toBe('ROTA 2')
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
    expect(confirmaPorAlvo('KZU4C37', '560049', alvos)).toBeNull()
  })

  it('é determinístico com 2 feitos na mesma loja (escolhe o mais cedo, não a ordem do array)', () => {
    const al = parseAlvos({ alvos: [
      { placa: 'ABC1D23', pontoidentificador: '111', alvosituacaoservico: 1, alvodatarealizado: '2026-06-12T16:00:00', alvodocumento: 'B', alvoordem: '9' },
      { placa: 'ABC1D23', pontoidentificador: '111', alvosituacaoservico: 1, alvodatarealizado: '2026-06-12T06:00:00', alvodocumento: 'A', alvoordem: '2' },
    ] })
    const c = confirmaPorAlvo('ABC1D23', '111', al)
    expect(c!.feitoISO).toBe('2026-06-12T06:00:00') // o mais cedo, independente da ordem da API
  })

  it('sem alvo para a loja → null', () => {
    expect(confirmaPorAlvo('RJN9F68', '9999999', alvos)).toBeNull()
  })
})

describe('inicioRotaPorAlvo (saída CD = início da rota)', () => {
  const alvos = parseAlvos(raw)

  it('pega o início do alvo da loja — mesmo PENDENTE (rota longa que o /stops não pega)', () => {
    expect(inicioRotaPorAlvo('KZU4C37', '560049', alvos)).toBe('2026-06-12T02:48:00')
  })

  it('usa o início do alvo daquela loja/trip (2ª viagem tem início próprio)', () => {
    expect(inicioRotaPorAlvo('RJN9F68', '8590555', alvos)).toBe('2026-06-12T02:51:03')
    expect(inicioRotaPorAlvo('RJN9F68', '7000710', alvos)).toBe('2026-06-12T13:23:55')
  })

  it('sem alvo da loja → null', () => {
    expect(inicioRotaPorAlvo('RJN9F68', '9999999', alvos)).toBeNull()
  })
})
