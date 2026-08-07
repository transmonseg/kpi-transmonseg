import { describe, it, expect } from 'vitest'
import { montaKpiLojaNutrimax } from './kpi-loja'
import type { LinhaEscalaNutrimax } from './types'
import type { AlvoApi } from '@/lib/unitrac-api/alvos'
import type { ResumoVeiculo, ParadaUnitrac } from '@/lib/types/unitrac'

function escala(overrides: Partial<LinhaEscalaNutrimax> = {}): LinhaEscalaNutrimax {
  return {
    carga: '92593', placaRaw: 'TTL7D40', placaNorm: 'TTL7D40', destino: 'CAMPOS',
    motorista: 'LUAN VIANA AREAS RIBEIRO', ajudante1: null, ajudante2: null,
    pesoKg: 2405, entPlanejado: 1, nfPlanejado: 1, ...overrides,
  }
}

function alvo(overrides: Partial<AlvoApi> = {}): AlvoApi {
  return {
    placaNorm: 'TTL7D40', codigoUnitrac: '129145', nome: 'WW CARNES MERCEARIA EIRELI',
    // feitoISO/inicioISO vêm da Unitrac como dígitos BRT crus, SEM Z — é essa a
    // forma real que o código precisa normalizar (ver montaKpiLojaNutrimax).
    situacao: 1, feitoISO: '2026-08-06T10:20:21.120', inicioISO: '2026-08-06T07:00:00',
    documento: '2310197', ordem: 0, rota: '95211', ...overrides,
  }
}

function parada(overrides: Partial<ParadaUnitrac> = {}): ParadaUnitrac {
  return {
    placa_norm: 'TTL7D40', chegada: new Date('2026-08-06T07:00:00Z'), saida: new Date('2026-08-06T07:05:00Z'),
    duracao_seg: 300, distancia_km: 10, endereco: null, lat: -22.8, lng: -43.2,
    local_parada: 'BASE - BASE GARAGEM', codigo_loja: null, nome_loja: null,
    classificacao: 'BASE', ordem: 1, ...overrides,
  }
}

function resumo(overrides: Partial<ResumoVeiculo> = {}): ResumoVeiculo {
  return {
    placa_norm: 'TTL7D40', placa_raw: 'TTL7D40', inicio_viagem: null, fim_viagem: null,
    qtd_paradas: 0, saida_cd: null, paradas: [], ...overrides,
  }
}

describe('montaKpiLojaNutrimax', () => {
  it('caminho feliz: loja confirmada com GPS batendo — todas as colunas preenchidas', () => {
    const paradaBase = parada({ classificacao: 'BASE', chegada: new Date('2026-08-06T07:00:00Z'), saida: new Date('2026-08-06T07:00:00Z'), ordem: 1 })
    const paradaLoja = parada({
      classificacao: 'LOJA', codigo_loja: '129145', nome_loja: 'WW CARNES MERCEARIA EIRELI',
      chegada: new Date('2026-08-06T10:20:00Z'), saida: new Date('2026-08-06T10:35:00Z'), ordem: 2,
    })
    const paradaVoltaBase = parada({ classificacao: 'BASE', chegada: new Date('2026-08-06T12:00:00Z'), saida: new Date('2026-08-06T12:00:00Z'), ordem: 3 })

    const r = montaKpiLojaNutrimax(
      [escala()],
      [alvo()],
      [resumo({ paradas: [paradaBase, paradaLoja, paradaVoltaBase] })],
    )

    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      loja: 'WW CARNES MERCEARIA EIRELI',
      motorista: 'LUAN VIANA AREAS RIBEIRO',
      placaNorm: 'TTL7D40',
      saidaBase: '2026-08-06T07:00:00.000Z',
      chegadaLoja: '2026-08-06T10:20:21.120Z',
      saidaLoja: '2026-08-06T10:35:00.000Z',
      chegadaBase: '2026-08-06T12:00:00.000Z',
      status: 'confirmado',
    })
    expect(r[0].tempoNaLojaMin).toBeGreaterThan(0)
    expect(r[0].tempoOperacaoMin).toBeGreaterThan(0)
  })

  it('loja pendente sem GPS correspondente: chegada/saída vazias, status pendente, não inventa horário', () => {
    const r = montaKpiLojaNutrimax(
      [escala()],
      [alvo({ situacao: 0, feitoISO: null })],
      [resumo({ paradas: [] })],
    )
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('pendente')
    expect(r[0].chegadaLoja).toBeNull()
    expect(r[0].saidaLoja).toBeNull()
    expect(r[0].tempoNaLojaMin).toBeNull()
  })

  it('placa da escala sem nenhum alvo: 1 linha "sem_rastreador", tudo nulo', () => {
    const r = montaKpiLojaNutrimax(
      [escala({ placaNorm: 'ZZZ9Z99', placaRaw: 'ZZZ9Z99' })],
      [alvo()], // alvo é de outra placa (TTL7D40) — não deve casar
      [resumo()],
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ loja: '—', placaNorm: 'ZZZ9Z99', status: 'sem_rastreador' })
  })

  it('2 NFs pro mesmo ponto (mesmo codigoUnitrac) viram 1 linha, não 2', () => {
    const r = montaKpiLojaNutrimax(
      [escala()],
      [
        // feitoISO cru, sem Z — igual ao que a Unitrac devolve.
        alvo({ documento: '2308904', feitoISO: '2026-08-06T10:20:21.120' }),
        alvo({ documento: '2308905', feitoISO: '2026-08-06T10:20:21.130' }),
      ],
      [resumo()],
    )
    expect(r).toHaveLength(1)
    // usa a confirmação mais cedo das duas
    expect(r[0].chegadaLoja).toBe('2026-08-06T10:20:21.120Z')
  })

  it('duas lojas distintas confirmadas no mesmo instante exato (confirmação em lote) não quebram o cálculo — cada uma vira 1 linha', () => {
    const r = montaKpiLojaNutrimax(
      [escala()],
      [
        alvo({ codigoUnitrac: '129145', nome: 'LOJA A', documento: 'NF1', feitoISO: '2026-08-06T10:20:21.120' }),
        alvo({ codigoUnitrac: '129146', nome: 'LOJA B', documento: 'NF2', feitoISO: '2026-08-06T10:20:21.120' }),
      ],
      [resumo()],
    )
    expect(r).toHaveLength(2)
    expect(r.map(l => l.loja).sort()).toEqual(['LOJA A', 'LOJA B'])
  })

  it('mesma placa em 2 linhas da escala (2 cargas no dia): as lojas dela saem 1x só, com o motorista da 1ª carga', () => {
    const r = montaKpiLojaNutrimax(
      [
        escala({ carga: '92593', motorista: 'MOTORISTA DA 1A CARGA' }),
        escala({ carga: '92594', motorista: 'MOTORISTA DA 2A CARGA' }),
      ],
      [alvo()],
      [resumo()],
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ loja: 'WW CARNES MERCEARIA EIRELI', motorista: 'MOTORISTA DA 1A CARGA' })
  })

  it('placa sem nenhum alvo mas COM GPS: mantém saída/chegada de base e km (só o que depende de alvo fica nulo)', () => {
    const r = montaKpiLojaNutrimax(
      [escala({ placaNorm: 'ZZZ9Z99', placaRaw: 'ZZZ9Z99' })],
      [alvo()], // alvo é de outra placa (TTL7D40) — a ZZZ9Z99 fica sem plano de entrega
      [resumo({
        placa_norm: 'ZZZ9Z99', placa_raw: 'ZZZ9Z99', qtd_paradas: 2,
        paradas: [
          parada({ placa_norm: 'ZZZ9Z99', classificacao: 'BASE', chegada: new Date('2026-08-06T07:00:00Z'), saida: new Date('2026-08-06T07:05:00Z'), ordem: 1 }),
          parada({ placa_norm: 'ZZZ9Z99', classificacao: 'BASE', chegada: new Date('2026-08-06T15:00:00Z'), saida: new Date('2026-08-06T15:10:00Z'), ordem: 2 }),
        ],
      })],
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      loja: '—', placaNorm: 'ZZZ9Z99', status: 'sem_rastreador',
      saidaBase: '2026-08-06T07:05:00.000Z',
      chegadaBase: '2026-08-06T15:00:00.000Z',
      kmPercorrido: 20,
      chegadaLoja: null, saidaLoja: null, tempoNaLojaMin: null,
    })
  })

  it('só 1 permanência em base o dia inteiro: saída da base preenchida, chegada na base fica vazia (não "voltou" de verdade)', () => {
    const r = montaKpiLojaNutrimax(
      [escala()],
      [alvo({ situacao: 0, feitoISO: null })],
      [resumo({ paradas: [parada({ classificacao: 'BASE' })] })],
    )
    expect(r[0].saidaBase).not.toBeNull()
    expect(r[0].chegadaBase).toBeNull()
  })
})
