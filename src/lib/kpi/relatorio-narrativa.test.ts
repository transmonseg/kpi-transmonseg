import { describe, it, expect } from 'vitest'
import { montarNarrativa } from './relatorio-narrativa'
import type { Metricas } from './dashboard-metricas'

const base = (o: Partial<Metricas>): Metricas => ({
  total: 0,
  entregue: 0,
  nao_foi: 0,
  sem_rastreador: 0,
  com_rastreador: 0,
  pctEntregue: 0,
  pctSemRastreador: 0,
  tempoMedioLojaMin: null,
  turnos: { madrugada: 0, manha: 0, tarde: 0, noite: 0 },
  porRede: [],
  rankingSucesso: [],
  rankingSemRastreador: [],
  serie: [],
  topSemRastreador: [],
  topNaoFoi: [],
  placasMaisAtivas: [],
  tempoMedioRotaMin: null,
  tempoMedioTotalMin: null,
  tempoMedioOperacaoMin: null,
  porClienteComTempos: [],
  topRotasDemoradas: [],
  topTempoEmLoja: [],
  topTempoTotal: [],
  distHorarioSaida: [],
  topMotoristas: [],
  serieTempos: [],
  ...o,
})

describe('montarNarrativa', () => {
  it('taxa abaixo da meta vira bullet de alerta', () => {
    const n = montarNarrativa(base({ total: 100, entregue: 90, pctEntregue: 90, sem_rastreador: 5, pctSemRastreador: 5 }), null, 'mes', ['2026-05-01', '2026-05-31'])
    expect(n.sumario.join(' ')).toMatch(/90%/)
    expect(n.sumario.join(' ')).toMatch(/meta/)
  })
  it('compara com período anterior quando há', () => {
    const at = base({ total: 100, entregue: 95, pctEntregue: 95 })
    const ant = base({ total: 100, entregue: 90, pctEntregue: 90 })
    expect(montarNarrativa(at, ant, 'mes', ['2026-05-01', '2026-05-31']).sumario.join(' ')).toMatch(/5( pontos| p\.p\.|%)/)
  })
  it('recomenda reduzir sem rastreador quando > 10%', () => {
    const n = montarNarrativa(base({ total: 100, sem_rastreador: 20, pctSemRastreador: 20, entregue: 70, pctEntregue: 70 }), null, 'mes', ['2026-05-01', '2026-05-31'])
    expect(n.recomendacoes.some(r => /rastreador/i.test(r.titulo))).toBe(true)
  })
})
