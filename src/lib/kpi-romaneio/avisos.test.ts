import { describe, it, expect } from 'vitest'
import { detectarDescasamentos } from './avisos'
import type { LinhaEscala } from './types'

function escala(overrides: Partial<LinhaEscala> = {}): LinhaEscala {
  return {
    carga: '93758',
    placaRaw: 'TTL7D40',
    placaNorm: 'TTL7D40',
    destino: 'CAMPOS',
    motorista: 'MOTORISTA TESTE',
    ajudante1: null,
    ajudante2: null,
    pesoKg: null,
    entPlanejado: null,
    nfPlanejado: null,
    ...overrides,
  }
}

describe('detectarDescasamentos', () => {
  it('sem nenhum descasamento -- lista vazia', () => {
    const escalas = [escala({ carga: '111', placaNorm: 'AAA1111' })]
    const romaneio = [{ carga: '111', placaNorm: 'AAA1111' }]
    expect(detectarDescasamentos(escalas, romaneio)).toEqual([])
  })

  it('carga da Escala sem correspondencia no Romaneio -- motivo sem_romaneio', () => {
    const escalas = [escala({ carga: '111', placaNorm: 'AAA1111' })]
    const romaneio: { carga: string; placaNorm: string }[] = []
    expect(detectarDescasamentos(escalas, romaneio)).toEqual([
      { carga: '111', placa: 'AAA1111', motivo: 'sem_romaneio' },
    ])
  })

  it('carga do Romaneio sem correspondencia na Escala -- motivo sem_escala', () => {
    const escalas: LinhaEscala[] = []
    const romaneio = [{ carga: '222', placaNorm: 'BBB2222' }]
    expect(detectarDescasamentos(escalas, romaneio)).toEqual([
      { carga: '222', placa: 'BBB2222', motivo: 'sem_escala' },
    ])
  })

  it('descasamento nas duas direcoes ao mesmo tempo', () => {
    const escalas = [
      escala({ carga: '111', placaNorm: 'AAA1111' }), // bate com o romaneio
      escala({ carga: '333', placaNorm: 'CCC3333' }), // so' na escala
    ]
    const romaneio = [
      { carga: '111', placaNorm: 'AAA1111' }, // bate com a escala
      { carga: '222', placaNorm: 'BBB2222' }, // so' no romaneio
    ]
    const r = detectarDescasamentos(escalas, romaneio)
    expect(r).toHaveLength(2)
    expect(r).toContainEqual({ carga: '222', placa: 'BBB2222', motivo: 'sem_escala' })
    expect(r).toContainEqual({ carga: '333', placa: 'CCC3333', motivo: 'sem_romaneio' })
  })

  it('mesma carga, placas diferentes -- nao casa (chave e carga+placa)', () => {
    const escalas = [escala({ carga: '111', placaNorm: 'AAA1111' })]
    const romaneio = [{ carga: '111', placaNorm: 'ZZZ9999' }]
    const r = detectarDescasamentos(escalas, romaneio)
    expect(r).toContainEqual({ carga: '111', placa: 'AAA1111', motivo: 'sem_romaneio' })
    expect(r).toContainEqual({ carga: '111', placa: 'ZZZ9999', motivo: 'sem_escala' })
  })

  // Task 2 (plano 2026-09-30, item 2 -- RQS7H76 29/09: Escala 34 x Romaneio 32):
  // NF PLANEJADO vem da Escala e o detalhe/taxa do Romaneio; a divergencia de
  // quantidade tem que virar aviso visivel (sem mexer em taxa/denominador).
  it('mesma carga+placa com NFs da Escala != NFs do Romaneio -- motivo nf_divergente com as duas contagens', () => {
    const escalas = [escala({ carga: '98969', placaNorm: 'RQS7H76', nfPlanejado: 34 })]
    const romaneio = [{ carga: '98969', placaNorm: 'RQS7H76', nfsRomaneio: 32 }]
    expect(detectarDescasamentos(escalas, romaneio)).toEqual([
      { carga: '98969', placa: 'RQS7H76', motivo: 'nf_divergente', nfEscala: 34, nfRomaneio: 32 },
    ])
  })

  it('contagens iguais, nfPlanejado nulo ou nfsRomaneio ausente -- sem aviso de NF', () => {
    const escalas = [
      escala({ carga: '1', placaNorm: 'AAA1111', nfPlanejado: 10 }),
      escala({ carga: '2', placaNorm: 'BBB2222', nfPlanejado: null }),
      escala({ carga: '3', placaNorm: 'CCC3333', nfPlanejado: 5 }),
    ]
    const romaneio = [
      { carga: '1', placaNorm: 'AAA1111', nfsRomaneio: 10 },
      { carga: '2', placaNorm: 'BBB2222', nfsRomaneio: 7 },
      { carga: '3', placaNorm: 'CCC3333' },
    ]
    expect(detectarDescasamentos(escalas, romaneio)).toEqual([])
  })
})
