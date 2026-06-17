import { describe, it, expect } from 'vitest'
import { conferiveis, foraConferencia, visibilidadeGps, ehProvisorio, seloTexto } from './derivados'
import type { Metricas } from '@/lib/kpi/dashboard-metricas'

const m = (o: Partial<Metricas>): Metricas => ({
  total: 0, entregue: 0, nao_foi: 0, sem_rastreador: 0, em_rota: 0, mudou_de_rota: 0,
  desatualizado: 0, indefinido: 0, com_rastreador: 0, pctEntregue: 0, taxaEntregaDefinitiva: 0,
  andamentoPct: 0, pctSemRastreador: 0, tempoMedioLojaMin: null,
  turnos: { madrugada: 0, manha: 0, tarde: 0, noite: 0 }, porRede: [], rankingSucesso: [],
  rankingSemRastreador: [], serie: [], topSemRastreador: [], topNaoFoi: [], topIndefinido: [],
  placasMaisAtivas: [], tempoMedioRotaMin: null, tempoMedioTotalMin: null, tempoMedioOperacaoMin: null,
  tempoMedioVoltaMin: null, pctComVolta: 0, distHorarioVolta: [], porClienteComTempos: [],
  topRotasDemoradas: [], topTempoEmLoja: [], topTempoTotal: [], distHorarioSaida: [],
  topMotoristas: [], serieTempos: [], ...o,
})

describe('derivados do relatório', () => {
  it('conferíveis e fora da conferência', () => {
    const x = m({ total: 27, entregue: 11, nao_foi: 0, sem_rastreador: 10, indefinido: 6 })
    expect(conferiveis(x)).toBe(11)
    expect(foraConferencia(x)).toBe(16)
  })
  it('visibilidade GPS = com_rastreador / total', () => {
    expect(visibilidadeGps(m({ total: 100, com_rastreador: 73 }))).toBe(73)
    expect(visibilidadeGps(m({ total: 0, com_rastreador: 0 }))).toBe(0)
  })
  it('selo: provisório quando há em rota', () => {
    expect(ehProvisorio(m({ em_rota: 2 }))).toBe(true)
    expect(ehProvisorio(m({ em_rota: 0 }))).toBe(false)
    expect(seloTexto(m({ em_rota: 2 }))).toEqual({ provisorio: true, texto: 'Provisório · 2 em rota' })
    expect(seloTexto(m({ em_rota: 0 }))).toEqual({ provisorio: false, texto: 'Final' })
  })
})
