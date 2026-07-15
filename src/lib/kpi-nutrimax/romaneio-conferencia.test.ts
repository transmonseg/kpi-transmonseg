import { describe, it, expect } from 'vitest'
import { montaRelatorioPorPlaca } from './romaneio-conferencia'
import type { LinhaEscalaNutrimax, LinhaRomaneioNutrimax } from './types'
import type { ParadaUnitrac, ResumoVeiculo } from '@/lib/types/unitrac'

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
    entPlanejado: null,
    nfPlanejado: null,
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

function parada(overrides: Partial<ParadaUnitrac> = {}): ParadaUnitrac {
  return {
    placa_norm: 'TTL7D40',
    chegada: new Date('2026-07-15T10:00:00.000Z'),
    saida: new Date('2026-07-15T10:15:00.000Z'),
    duracao_seg: 900,
    distancia_km: 12.5,
    endereco: null,
    lat: null,
    lng: null,
    local_parada: '165049 - ANDRE LUIS SILVA VELASCO',
    codigo_loja: '165049',
    nome_loja: 'ANDRE LUIS SILVA VELASCO',
    classificacao: 'LOJA',
    ordem: 1,
    ...overrides,
  }
}

function resumoVeiculo(overrides: Partial<ResumoVeiculo> = {}): ResumoVeiculo {
  return {
    placa_norm: 'TTL7D40',
    placa_raw: 'TTL7D40',
    inicio_viagem: new Date('2026-07-15T08:00:00.000Z'),
    fim_viagem: new Date('2026-07-15T16:00:00.000Z'),
    qtd_paradas: 1,
    paradas: [parada()],
    saida_cd: null,
    ...overrides,
  }
}

describe('montaRelatorioPorPlaca', () => {
  it('status ok: placa bate, recebeu todos os NFs e todos os clientes planejados', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 2, entPlanejado: 2 })],
      [
        romaneio({ nf: '1', clienteCodigo: 'C1' }),
        romaneio({ nf: '2', clienteCodigo: 'C2' }),
      ],
      [],
    )
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('ok')
    expect(r[0].nfRecebido).toBe(2)
    expect(r[0].entRecebido).toBe(2)
    expect(r[0].clientes).toHaveLength(2)
    expect(r[0].clientes[0]).toEqual({
      nf: '1', clienteNome: 'ANDRE LUIS SILVA VELASCO', endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *', parada: null,
    })
  })

  it('status ausente: nenhuma linha do romaneio pra essa carga', () => {
    const r = montaRelatorioPorPlaca([escala({ carga: '99999' })], [romaneio({ carga: '92593' })], [])
    expect(r[0].status).toBe('ausente')
    expect(r[0].nfRecebido).toBe(0)
    expect(r[0].entRecebido).toBe(0)
    expect(r[0].clientes).toEqual([])
  })

  it('status divergente: placa da escala diferente da placa no romaneio', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ placaNorm: 'TTL7D40', nfPlanejado: 1 })],
      [romaneio({ placa: 'ABC1D23', nf: '1' })],
      [],
    )
    expect(r[0].status).toBe('divergente')
  })

  it('status divergente: recebeu menos NFs do que o planejado', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 5 })],
      [romaneio({ nf: '1', clienteCodigo: 'C1' }), romaneio({ nf: '2', clienteCodigo: 'C2' })],
      [],
    )
    expect(r[0].status).toBe('divergente')
    expect(r[0].nfRecebido).toBe(2)
  })

  it('status divergente: NF bate mas faltou cliente (ENT) — 2 notas pro mesmo cliente, outro cliente nunca apareceu', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 2, entPlanejado: 2 })],
      [
        romaneio({ nf: '1', clienteCodigo: 'C1' }),
        romaneio({ nf: '2', clienteCodigo: 'C1' }),
      ],
      [],
    )
    expect(r[0].nfRecebido).toBe(2)
    expect(r[0].entRecebido).toBe(1)
    expect(r[0].status).toBe('divergente')
  })

  it('sem nfPlanejado nem entPlanejado (null) não gera falso-divergente — só confere placa', () => {
    const r = montaRelatorioPorPlaca([escala({ nfPlanejado: null, entPlanejado: null })], [romaneio({ nf: '1' })], [])
    expect(r[0].status).toBe('ok')
  })

  it('preserva a ordem da escala e ignora cargas do romaneio sem escala correspondente', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ carga: 'A', nfPlanejado: 1 }), escala({ carga: 'B', nfPlanejado: 1 })],
      [romaneio({ carga: 'B', nf: '1' }), romaneio({ carga: 'A', nf: '1' }), romaneio({ carga: 'ORFA', nf: '1' })],
      [],
    )
    expect(r.map(x => x.carga)).toEqual(['A', 'B'])
  })

  it('cliente com código de loja batendo uma parada GPS fica confirmado, com chegada/saída/km', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 1, entPlanejado: 1 })],
      [romaneio({ nf: '1', clienteCodigo: '165049' })],
      [resumoVeiculo()],
    )
    expect(r[0].clientes[0].parada).toEqual({
      chegada: '2026-07-15T10:00:00.000Z',
      saida: '2026-07-15T10:15:00.000Z',
      distanciaKm: 12.5,
      localParada: '165049 - ANDRE LUIS SILVA VELASCO',
      codigoLoja: '165049',
      nomeLoja: 'ANDRE LUIS SILVA VELASCO',
    })
    expect(r[0].kmPercorrido).toBe(12.5)
    expect(r[0].qtdParadasReal).toBe(1)
    expect(r[0].inicioViagem).toBe('2026-07-15T08:00:00.000Z')
    expect(r[0].fimViagem).toBe('2026-07-15T16:00:00.000Z')
  })

  it('cliente sem parada correspondente fica com parada: null mesmo com o veículo rastreado', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 1, entPlanejado: 1 })],
      [romaneio({ nf: '1', clienteCodigo: '999999' })],
      [resumoVeiculo()],
    )
    expect(r[0].clientes[0].parada).toBeNull()
  })

  it('parada de loja sem cliente correspondente na carga vira paradasSemCliente', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 1, entPlanejado: 1 })],
      [romaneio({ nf: '1', clienteCodigo: '165049' })],
      [resumoVeiculo({ paradas: [parada(), parada({ codigo_loja: '999999', nome_loja: 'LOJA FANTASMA', local_parada: '999999 - LOJA FANTASMA', ordem: 2 })], qtd_paradas: 2 })],
    )
    expect(r[0].paradasSemCliente).toHaveLength(1)
    expect(r[0].paradasSemCliente[0].codigoLoja).toBe('999999')
  })

  it('placa sem ResumoVeiculo (sem rastreador) zera todos os campos de GPS', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 1, entPlanejado: 1 })],
      [romaneio({ nf: '1', clienteCodigo: '165049' })],
      [],
    )
    expect(r[0].kmPercorrido).toBeNull()
    expect(r[0].qtdParadasReal).toBe(0)
    expect(r[0].inicioViagem).toBeNull()
    expect(r[0].fimViagem).toBeNull()
    expect(r[0].clientes[0].parada).toBeNull()
    expect(r[0].paradasSemCliente).toEqual([])
  })

  it('parada repetida no mesmo código de loja usa a primeira por ordem', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 1, entPlanejado: 1 })],
      [romaneio({ nf: '1', clienteCodigo: '165049' })],
      [resumoVeiculo({
        paradas: [
          parada({ ordem: 2, chegada: new Date('2026-07-15T14:00:00.000Z') }),
          parada({ ordem: 1, chegada: new Date('2026-07-15T09:00:00.000Z') }),
        ],
        qtd_paradas: 2,
      })],
    )
    expect(r[0].clientes[0].parada?.chegada).toBe('2026-07-15T09:00:00.000Z')
  })
})
