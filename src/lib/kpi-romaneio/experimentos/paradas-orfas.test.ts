import { describe, it, expect } from 'vitest'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { DumpExperimento, LinhaDump } from './tipos'
import { analisarParadasOrfas, categoriaPendente, orfasProximasDoPendente, paradasOrfasDaPlaca } from './paradas-orfas'

const P = { duracaoMinSeg: 120, raioReivindicadaM: 800 }

function linha(o: Partial<LinhaDump>): LinhaDump {
  return {
    nf: 'NF', carga: '100', placa: 'ABC1234', clienteNome: 'C', endereco: 'RUA', lat: -22.9, lng: -43.2,
    geoConfiavel: true, geoMotivo: null, status: 'pendente', observacao: null, ...o,
  }
}

function parada(id: string, lat: number, lng: number, duracaoSeg = 600): UnitracParadaRow {
  return {
    id, placa_norm: 'ABC1234', chegada: '2026-09-17T13:00:00.000Z', saida: '2026-09-17T13:10:00.000Z',
    fim_real: '2026-09-17T13:10:00.000Z', duracao_seg: duracaoSeg, local_parada: 'RUA', codigo_loja: null,
    nome_loja: null, lat, lng, endereco: null, classificacao: 'FORA_BASE', ordem: 1,
  }
}

// 0,001 grau de latitude ~ 111 m.
const CONFIRMADA = linha({ nf: 'C1', status: 'confirmado_gps', lat: -22.9, lng: -43.2 })
const S_DA_CONFIRMADA = parada('S1', -22.9, -43.2)        // reivindicada pela C1
const S_ORFA = parada('S2', -22.91, -43.2)                // ~1112 m da C1 -> orfa
const S_CURTA = parada('S3', -22.9105, -43.2, 60)         // orfa mas curta demais
const PEND_PERTO = linha({ nf: 'P1', lat: -22.9108, lng: -43.2, observacao: 'PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR' }) // ~89 m de S2
const PEND_LONGE = linha({ nf: 'P2', lat: -22.95, lng: -43.2 })                                                                               // ~4,4 km de S2

function dump(linhas: LinhaDump[], paradas: UnitracParadaRow[]): DumpExperimento {
  return { data: '2026-09-17', linhas, paradasPorPlaca: { ABC1234: paradas } }
}

describe('paradasOrfasDaPlaca', () => {
  it('só devolve parada FORA_BASE, longa o bastante e sem NF confirmada por perto', () => {
    const base = { ...parada('B', -22.95, -43.25), classificacao: 'BASE' as const }
    const d = dump([CONFIRMADA, PEND_PERTO], [S_DA_CONFIRMADA, S_ORFA, S_CURTA, base])
    expect(paradasOrfasDaPlaca(d, 'ABC1234', P).map(s => s.id)).toEqual(['S2'])
  })
})

describe('orfasProximasDoPendente', () => {
  it('respeita o raio e ordena por distância', () => {
    const d = dump([CONFIRMADA, PEND_PERTO], [S_ORFA])
    expect(orfasProximasDoPendente(d, PEND_PERTO, P, 500).map(x => x.parada.id)).toEqual(['S2'])
    expect(orfasProximasDoPendente(d, PEND_LONGE, P, 500)).toEqual([])
  })

  it('pendente sem coordenada nunca tem órfã', () => {
    const d = dump([CONFIRMADA], [S_ORFA])
    expect(orfasProximasDoPendente(d, linha({ nf: 'PX', lat: null, lng: null }), P, 5000)).toEqual([])
  })
})

describe('analisarParadasOrfas', () => {
  it('conta pendentes com órfã por raio e agrupa por categoria', () => {
    const d = dump([CONFIRMADA, PEND_PERTO, PEND_LONGE], [S_DA_CONFIRMADA, S_ORFA])
    const a = analisarParadasOrfas(d, [500, 5000], P)
    expect(a.totalNfs).toBe(3)
    expect(a.identificadas).toBe(1)
    expect(a.taxaIdentificada).toBeCloseTo(1 / 3)
    expect(a.pendentes).toBe(2)
    expect(a.orfasTotal).toBe(1)
    expect(a.porRaio[0].raioM).toBe(500)
    expect(a.porRaio[0].comOrfa).toBe(1)
    expect(a.porRaio[0].porCategoria['parada 500m-2km']).toEqual({ pendentes: 1, comOrfa: 1 })
    expect(a.porRaio[0].porCategoria['sem confirmação']).toEqual({ pendentes: 1, comOrfa: 0 })
    expect(a.porRaio[1].comOrfa).toBe(2)
  })

  it('exclusiva = a órfã mais próxima do pendente também tem ele como pendente mais próximo', () => {
    const outro = linha({ nf: 'P1b', lat: -22.9125, lng: -43.2 }) // ~167 m de S2, mais longe que P1
    const d = dump([CONFIRMADA, PEND_PERTO, outro], [S_ORFA])
    const r = analisarParadasOrfas(d, [500], P).porRaio[0]
    expect(r.comOrfa).toBe(2)
    expect(r.comOrfaExclusiva).toBe(1)
  })

  it('pendente sem coordenada entra em pendentesSemCoordenada e nunca em comOrfa', () => {
    const d = dump([CONFIRMADA, linha({ nf: 'PX', lat: null, lng: null })], [S_ORFA])
    const a = analisarParadasOrfas(d, [5000], P)
    expect(a.pendentesSemCoordenada).toBe(1)
    expect(a.porRaio[0].comOrfa).toBe(0)
  })
})

describe('categoriaPendente', () => {
  it('mapeia as observações do relatório', () => {
    expect(categoriaPendente(null)).toBe('sem confirmação')
    expect(categoriaPendente('ENDEREÇO COM COORDENADA IMPRECISA - CONFERIR CADASTRO')).toBe('coordenada imprecisa')
    expect(categoriaPendente('PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR')).toBe('parada 500m-2km')
    expect(categoriaPendente('NÃO FOI AO CLIENTE (caminhão não esteve na região)')).toBe('não foi ao cliente')
    expect(categoriaPendente('PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR')).toBe('passou sem parar')
    expect(categoriaPendente('CLIENTE SEM ACESSO RODOVIÁRIO (ILHA) - CONFERIR COM A OPERAÇÃO')).toBe('ilha')
    expect(categoriaPendente('VEÍCULO SEM MOVIMENTO NO DIA')).toBe('sem movimento')
    expect(categoriaPendente('SEM DADO DE GPS NO PERÍODO')).toBe('sem dado de GPS')
    expect(categoriaPendente('OUTRA COISA')).toBe('outra')
  })
})
