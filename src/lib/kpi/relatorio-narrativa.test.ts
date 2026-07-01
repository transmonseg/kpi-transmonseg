import { describe, it, expect } from 'vitest'
import { montarNarrativa } from './relatorio-narrativa'
import type { Metricas } from './dashboard-metricas'

const base = (o: Partial<Metricas>): Metricas => ({
  total: 0, entregue: 0, nao_foi: 0, sem_rastreador: 0,
  indefinido: 0, com_rastreador: 0, pctEntregue: 0, taxaEntregaDefinitiva: 0,
  pctSemRastreador: 0, tempoMedioLojaMin: null,
  turnos: { madrugada: 0, manha: 0, tarde: 0, noite: 0 }, porRede: [], rankingSucesso: [],
  rankingSemRastreador: [], serie: [], topSemRastreador: [], topNaoFoi: [], topIndefinido: [],
  placasMaisAtivas: [], tempoMedioRotaMin: null, tempoMedioTotalMin: null, tempoMedioOperacaoMin: null,
  tempoMedioVoltaMin: null, pctComVolta: 0, distHorarioVolta: [], porClienteComTempos: [],
  topRotasDemoradas: [], topTempoEmLoja: [], topTempoTotal: [], distHorarioSaida: [],
  topMotoristas: [], serieTempos: [], ...o,
})

describe('montarNarrativa', () => {
  it('fala em conferíveis e visibilidade, e sinaliza abaixo da meta', () => {
    const n = montarNarrativa(
      base({ total: 100, entregue: 81, nao_foi: 9, sem_rastreador: 8, indefinido: 2, com_rastreador: 90, pctEntregue: 90, taxaEntregaDefinitiva: 90, pctSemRastreador: 8 }),
      null, 'mes', ['2026-05-01', '2026-05-31'],
    )
    const txt = n.sumario.join(' ')
    expect(txt).toMatch(/conferíveis/i)
    expect(txt).toMatch(/visibilidade/i)
    expect(txt).toMatch(/90%/)
    expect(txt).toMatch(/meta/i)
  })
  it('nunca usa travessão em nada', () => {
    const n = montarNarrativa(base({ total: 50, entregue: 40, nao_foi: 5, sem_rastreador: 3, indefinido: 2, com_rastreador: 47, pctEntregue: 89, taxaEntregaDefinitiva: 89, pctSemRastreador: 6 }), null, 'dia', ['2026-05-21', '2026-05-21'])
    for (const b of n.sumario) expect(b).not.toContain('—')
    for (const r of n.recomendacoes) { expect(r.titulo).not.toContain('—'); expect(r.corpo).not.toContain('—') }
  })
  it('compara com período anterior quando há', () => {
    const at = base({ total: 100, entregue: 95, nao_foi: 5, pctEntregue: 95, taxaEntregaDefinitiva: 95 })
    const ant = base({ total: 100, entregue: 90, nao_foi: 10, pctEntregue: 90, taxaEntregaDefinitiva: 90 })
    expect(montarNarrativa(at, ant, 'mes', ['2026-05-01', '2026-05-31']).sumario.join(' ')).toMatch(/5 ponto/)
  })
  it('recomenda reduzir sem rastreador quando visibilidade baixa (> 10% sem GPS)', () => {
    const n = montarNarrativa(base({ total: 100, sem_rastreador: 20, pctSemRastreador: 20, entregue: 70, nao_foi: 10, com_rastreador: 80, pctEntregue: 88, taxaEntregaDefinitiva: 88 }), null, 'mes', ['2026-05-01', '2026-05-31'])
    expect(n.recomendacoes.some(r => /rastreador|visibilidade/i.test(r.titulo))).toBe(true)
  })
  it('recomenda investigar "em análise" quando há muita linha sem classificação', () => {
    const n = montarNarrativa(base({ total: 100, entregue: 50, nao_foi: 0, indefinido: 40, sem_rastreador: 10, com_rastreador: 60, pctEntregue: 100, taxaEntregaDefinitiva: 100, pctSemRastreador: 10 }), null, 'mes', ['2026-05-01', '2026-05-31'])
    expect(n.recomendacoes.some(r => /análise|conferência|classifica/i.test(r.titulo))).toBe(true)
  })
})
