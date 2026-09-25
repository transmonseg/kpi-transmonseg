import { describe, it, expect } from 'vitest'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaDetalheEntrega, LinhaGeocodificada } from '../types'
import { montarDumpExperimento } from './dump'

function geo(o: Partial<LinhaGeocodificada>): LinhaGeocodificada {
  return {
    carga: '100', destino: 'X', placa: 'ABC-1234', motorista: 'M', ajudantes: [],
    nf: 'NF1', clienteCodigo: 'C1', clienteNome: 'CLIENTE 1', endereco: 'RUA A, 1 - RJ',
    lat: -22.9, lng: -43.2, ...o,
  }
}

function det(o: Partial<LinhaDetalheEntrega>): LinhaDetalheEntrega {
  return {
    carga: '100', placa: 'ABC1234', motorista: 'M', clienteCodigo: 'C1', nf: 'NF1',
    clienteNome: 'CLIENTE 1', endereco: 'RUA A, 1 - RJ', saidaCd: null, chegadaCd: null,
    tempoOperacaoMin: null, chegada: null, saida: null, tempoParadaMin: null,
    status: 'pendente', temRastreador: true, observacao: null,
    evidencia: 'sem_evidencia', distParadaM: null, ...o,
  }
}

function parada(id: string): UnitracParadaRow {
  return {
    id, placa_norm: 'ABC1234', chegada: '2026-09-17T13:00:00.000Z', saida: '2026-09-17T13:10:00.000Z',
    fim_real: '2026-09-17T13:10:00.000Z', duracao_seg: 600, local_parada: 'RUA', codigo_loja: null,
    nome_loja: null, lat: -22.9, lng: -43.2, endereco: null, classificacao: 'FORA_BASE', ordem: 1,
  }
}

describe('montarDumpExperimento', () => {
  it('junta a linha geocodificada com o veredito do detalhe, pela chave carga+NF, usando a placa normalizada do detalhe', () => {
    const dump = montarDumpExperimento({
      data: '2026-09-17',
      romaneioGeo: [geo({ nf: 'NF1', placa: 'ABC-1234' })],
      detalhe: [det({ nf: 'NF1', status: 'confirmado_gps', observacao: 'x' })],
      paradasPorPlaca: new Map([['ABC1234', [parada('p1')]]]),
    })
    expect(dump.data).toBe('2026-09-17')
    expect(dump.linhas).toHaveLength(1)
    expect(dump.linhas[0]).toMatchObject({ nf: 'NF1', placa: 'ABC1234', status: 'confirmado_gps', observacao: 'x', lat: -22.9, geoConfiavel: true, geoMotivo: null })
    expect(dump.paradasPorPlaca['ABC1234']).toHaveLength(1)
  })

  it('descarta linha do romaneio sem detalhe correspondente e só leva as paradas das placas presentes', () => {
    const dump = montarDumpExperimento({
      data: '2026-09-17',
      romaneioGeo: [geo({ nf: 'NF1' }), geo({ nf: 'NF2', carga: '999' })],
      detalhe: [det({ nf: 'NF1' })],
      paradasPorPlaca: new Map([['ABC1234', [parada('p1')]], ['OUTRA99', [parada('p2')]]]),
    })
    expect(dump.linhas.map(l => l.nf)).toEqual(['NF1'])
    expect(Object.keys(dump.paradasPorPlaca)).toEqual(['ABC1234'])
  })

  it('preserva geoConfiavel=false e o motivo', () => {
    const dump = montarDumpExperimento({
      data: '2026-09-17',
      romaneioGeo: [geo({ nf: 'NF1', geoConfiavel: false, geoMotivo: 'bairro_divergente' })],
      detalhe: [det({ nf: 'NF1' })],
      paradasPorPlaca: new Map(),
    })
    expect(dump.linhas[0].geoConfiavel).toBe(false)
    expect(dump.linhas[0].geoMotivo).toBe('bairro_divergente')
    expect(dump.paradasPorPlaca['ABC1234']).toEqual([])
  })
})
