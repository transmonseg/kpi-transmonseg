import { describe, it, expect } from 'vitest'
import { montaKpiViagemPorCarga } from './kpi-viagem'
import type { LinhaEscalaNutrimax, ResumoViagemPlacaNutrimax } from './types'

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
    nfPlanejado: 36,
    ...overrides,
  }
}

function resumo(overrides: Partial<ResumoViagemPlacaNutrimax> = {}): ResumoViagemPlacaNutrimax {
  return {
    placaNorm: 'TTL7D40',
    kmPercorrido: 93.5,
    qtdParadas: 31,
    inicioViagem: '2026-07-15T05:07:00.000Z',
    fimViagem: '2026-07-15T14:08:00.000Z',
    ...overrides,
  }
}

describe('montaKpiViagemPorCarga', () => {
  it('status ok: placa aparece no relatório com paradas >= planejado (ENT)', () => {
    const r = montaKpiViagemPorCarga([escala({ entPlanejado: 31 })], [resumo({ qtdParadas: 31 })])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      carga: '92593', placaNorm: 'TTL7D40', qtdParadasReal: 31, kmPercorrido: 93.5, status: 'ok',
    })
  })

  it('status sem_rastreador: placa da escala não aparece em nenhum resumo do relatório', () => {
    const r = montaKpiViagemPorCarga([escala({ placaNorm: 'ZZZ9Z99' })], [resumo({ placaNorm: 'TTL7D40' })])
    expect(r[0].status).toBe('sem_rastreador')
    expect(r[0].qtdParadasReal).toBe(0)
    expect(r[0].kmPercorrido).toBeNull()
  })

  it('status incompleto: placa aparece mas com menos paradas do que o planejado', () => {
    const r = montaKpiViagemPorCarga([escala({ entPlanejado: 31 })], [resumo({ qtdParadas: 10 })])
    expect(r[0].status).toBe('incompleto')
    expect(r[0].qtdParadasReal).toBe(10)
  })

  it('sem entPlanejado (null) não gera incompleto — só confere se a placa apareceu', () => {
    const r = montaKpiViagemPorCarga([escala({ entPlanejado: null })], [resumo({ qtdParadas: 1 })])
    expect(r[0].status).toBe('ok')
  })

  it('preserva a ordem da escala', () => {
    const r = montaKpiViagemPorCarga(
      [escala({ carga: 'A', placaNorm: 'AAA1111' }), escala({ carga: 'B', placaNorm: 'BBB2222' })],
      [resumo({ placaNorm: 'BBB2222' }), resumo({ placaNorm: 'AAA1111' })],
    )
    expect(r.map(x => x.carga)).toEqual(['A', 'B'])
  })
})
