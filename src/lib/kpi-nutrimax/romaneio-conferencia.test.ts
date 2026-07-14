import { describe, it, expect } from 'vitest'
import { montaRelatorioPorPlaca } from './romaneio-conferencia'
import type { LinhaEscalaNutrimax, LinhaRomaneioNutrimax } from './types'

function escala(overrides: Partial<LinhaEscalaNutrimax> = {}): LinhaEscalaNutrimax {
  return {
    carga: '92593',
    placaRaw: 'TTL7D40',
    placaNorm: 'TTL7D40',
    destino: 'CAMPOS',
    motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudante1: 'LEANDRO DA HORA BATISTA',
    ajudante2: null,
    pesoKg: 2405,
    entPlanejado: 31,
    nfPlanejado: 2,
    ...overrides,
  }
}

function romaneio(overrides: Partial<LinhaRomaneioNutrimax> = {}): LinhaRomaneioNutrimax {
  return {
    carga: '92593',
    destino: 'CAMPOS',
    placa: 'TTL7D40',
    motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudantes: [],
    nf: '2270025',
    clienteCodigo: '165049',
    clienteNome: 'ANDRE LUIS SILVA VELASCO',
    endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *',
    ...overrides,
  }
}

describe('montaRelatorioPorPlaca', () => {
  it('status ok: placa bate e recebeu todos os NFs planejados', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 2 })],
      [romaneio({ nf: '1' }), romaneio({ nf: '2' })],
    )
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('ok')
    expect(r[0].nfRecebido).toBe(2)
    expect(r[0].clientes).toHaveLength(2)
    expect(r[0].clientes[0]).toEqual({ nf: '1', clienteNome: 'ANDRE LUIS SILVA VELASCO', endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *' })
  })

  it('status ausente: nenhuma linha do romaneio pra essa carga', () => {
    const r = montaRelatorioPorPlaca([escala({ carga: '99999' })], [romaneio({ carga: '92593' })])
    expect(r[0].status).toBe('ausente')
    expect(r[0].nfRecebido).toBe(0)
    expect(r[0].clientes).toEqual([])
  })

  it('status divergente: placa da escala diferente da placa no romaneio', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ placaNorm: 'TTL7D40', nfPlanejado: 1 })],
      [romaneio({ placa: 'ABC1D23', nf: '1' })],
    )
    expect(r[0].status).toBe('divergente')
  })

  it('status divergente: recebeu menos NFs do que o planejado', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 5 })],
      [romaneio({ nf: '1' }), romaneio({ nf: '2' })],
    )
    expect(r[0].status).toBe('divergente')
    expect(r[0].nfRecebido).toBe(2)
  })

  it('sem nfPlanejado (null) não gera falso-divergente por contagem — só confere placa', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: null })],
      [romaneio({ nf: '1' })],
    )
    expect(r[0].status).toBe('ok')
  })

  it('preserva a ordem da escala e ignora cargas do romaneio sem escala correspondente', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ carga: 'A', nfPlanejado: 1 }), escala({ carga: 'B', nfPlanejado: 1 })],
      [romaneio({ carga: 'B', nf: '1' }), romaneio({ carga: 'A', nf: '1' }), romaneio({ carga: 'ORFA', nf: '1' })],
    )
    expect(r.map(x => x.carga)).toEqual(['A', 'B'])
  })
})
