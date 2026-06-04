import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { Relatorio, type RelatorioCtx } from './Relatorio'
import { montarNarrativa } from '@/lib/kpi/relatorio-narrativa'
import type { Metricas } from '@/lib/kpi/dashboard-metricas'

// Metricas de exemplo (mínimo viável + dados pra exercitar gráficos/tabelas).
function fakeMetricas(over: Partial<Metricas> = {}): Metricas {
  return {
    total: 120,
    entregue: 110,
    nao_foi: 6,
    sem_rastreador: 4,
    com_rastreador: 116,
    pctEntregue: 92,
    pctSemRastreador: 3,
    tempoMedioLojaMin: 35,
    turnos: { madrugada: 5, manha: 60, tarde: 40, noite: 15 },
    porRede: [
      { rede_id: 'PRINCESA', total: 60, entregue: 56, nao_foi: 3, sem_rastreador: 1, pctEntregue: 93, tempoMedioMin: 42 },
      { rede_id: 'ASSAI', total: 40, entregue: 38, nao_foi: 1, sem_rastreador: 1, pctEntregue: 95, tempoMedioMin: 38 },
      { rede_id: 'SENDAS', total: 20, entregue: 16, nao_foi: 2, sem_rastreador: 2, pctEntregue: 80, tempoMedioMin: null },
    ],
    rankingSucesso: [],
    rankingSemRastreador: [],
    serie: [
      { data: '2026-05-01', entregue: 30, nao_foi: 2, sem_rastreador: 1, total: 33 },
      { data: '2026-05-02', entregue: 40, nao_foi: 1, sem_rastreador: 2, total: 43 },
      { data: '2026-05-03', entregue: 40, nao_foi: 3, sem_rastreador: 1, total: 44 },
    ],
    topSemRastreador: [
      { rede_id: 'SENDAS', loja: 'Sendas Centro', ocorrencias: 2 },
      { rede_id: 'PRINCESA', loja: 'Princesa Norte', ocorrencias: 1 },
    ],
    topNaoFoi: [
      { rede_id: 'SENDAS', loja: 'Sendas Centro', ocorrencias: 2 },
      { rede_id: 'ASSAI', loja: 'Assaí Sul', ocorrencias: 1 },
    ],
    placasMaisAtivas: [{ placa: 'ABC1234', entregas: 20 }],
    tempoMedioRotaMin: 90,
    tempoMedioTotalMin: 125,
    tempoMedioOperacaoMin: 140,
    porClienteComTempos: [],
    topRotasDemoradas: [
      { rede_id: 'SENDAS', loja: 'Sendas Centro', n: 5, tempo_rota: 260, tempo_loja: 40, tempo_total: 300 },
      { rede_id: 'PRINCESA', loja: 'Princesa Norte', n: 4, tempo_rota: 180, tempo_loja: 30, tempo_total: 210 },
    ],
    topTempoEmLoja: [
      { rede_id: 'ASSAI', loja: 'Assaí Sul', n: 6, tempo_rota: 90, tempo_loja: 70, tempo_total: 160 },
    ],
    topTempoTotal: [],
    distHorarioSaida: Array.from({ length: 24 }, (_, h) => ({ hora: h, entregas: h >= 5 && h <= 9 ? 15 : 1 })),
    topMotoristas: [
      { motorista: 'João Silva', entregas: 30, tempo_rota: 88, tempo_loja: 32 },
      { motorista: 'Maria Souza', entregas: 25, tempo_rota: 95, tempo_loja: 40 },
    ],
    serieTempos: [
      { data: '2026-05-01', tempo_rota: 85, tempo_loja: 30, tempo_total: 115 },
      { data: '2026-05-02', tempo_rota: 92, tempo_loja: 35, tempo_total: 127 },
      { data: '2026-05-03', tempo_rota: 90, tempo_loja: 38, tempo_total: 128 },
    ],
    ...over,
  }
}

describe('Relatorio (smoke)', () => {
  it('renderiza o PDF sem lançar e produz buffer não trivial', async () => {
    const m = fakeMetricas()
    const ant = fakeMetricas({ pctEntregue: 89, nao_foi: 9, pctSemRastreador: 6, tempoMedioTotalMin: 130, tempoMedioRotaMin: 95, tempoMedioLojaMin: 38 })
    const intervalo: [string, string] = ['2026-05-01', '2026-05-31']
    const ctx: RelatorioCtx = {
      m,
      ant,
      periodo: 'mes',
      intervalo,
      redes: ['PRINCESA', 'ASSAI', 'SENDAS'],
      narrativa: montarNarrativa(m, ant, 'mes', intervalo),
      mes: '2026-05',
      geradoEm: '30/05/2026 14:00',
    }
    const buf = await renderToBuffer(<Relatorio ctx={ctx} />)
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('renderiza sem período anterior e com listas vazias', async () => {
    const m = fakeMetricas({
      serie: [],
      serieTempos: [],
      porRede: [],
      topMotoristas: [],
      topRotasDemoradas: [],
      topTempoEmLoja: [],
      topSemRastreador: [],
      topNaoFoi: [],
      distHorarioSaida: Array.from({ length: 24 }, (_, h) => ({ hora: h, entregas: 0 })),
    })
    const intervalo: [string, string] = ['2026-05-21', '2026-05-21']
    const ctx: RelatorioCtx = {
      m,
      ant: null,
      periodo: 'dia',
      intervalo,
      redes: [],
      narrativa: montarNarrativa(m, null, 'dia', intervalo),
      mes: '2026-05',
      geradoEm: '30/05/2026 14:00',
    }
    const buf = await renderToBuffer(<Relatorio ctx={ctx} />)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
