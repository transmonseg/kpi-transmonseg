import { describe, it, expect } from 'vitest'
import { calcularNotasPorHora, montarLinhaDashboardDiaria, atribuirRankEPerformance, agregarEquipeSemanal, montarResumoPeriodo, type LinhaDashboardDiaria, type LinhaDashboardComRank } from './dashboard'
import type { LinhaKpiRomaneio } from './types'

function linhaKpi(over: Partial<LinhaKpiRomaneio> = {}): LinhaKpiRomaneio {
  return {
    carga: 'C1', placa: 'TOS1H26', destino: 'CAMPOS', motorista: 'EDUARDO', ajudante1: null, ajudante2: null,
    pesoKg: null, clientesPlanejados: null, nfPlanejado: 37, paradasReais: 30, kmPercorrido: 196.3,
    saidaCd: '2026-09-01T10:59:00Z', chegadaCd: '2026-09-01T23:58:00Z', tempoOperacaoMin: 46740 / 60,
    tempoMedioParadaMin: null, status: 'OK', temRastreador: true,
    ...over,
  }
}

describe('calcularNotasPorHora', () => {
  // Achado real (planilha da Nutry Max, 01/09): TOS1H26, 37 notas, 46740s
  // (12h59min) em rota -> 2,8498... notas/hora.
  it('bate com o numero real da cliente (37 notas / 12h59min)', () => {
    expect(calcularNotasPorHora(37, 46740 / 60)).toBeCloseTo(2.8498074454428757, 6)
  })
  it('sem notas: null', () => {
    expect(calcularNotasPorHora(null, 60)).toBeNull()
  })
  it('sem tempo em rota: null', () => {
    expect(calcularNotasPorHora(10, null)).toBeNull()
  })
  it('tempo zero ou negativo (rota corrompida): null, nunca divide por zero', () => {
    expect(calcularNotasPorHora(10, 0)).toBeNull()
    expect(calcularNotasPorHora(10, -5)).toBeNull()
  })
})

describe('montarLinhaDashboardDiaria', () => {
  it('mapeia LinhaKpiRomaneio pro dashboard -- notas = NF PLANEJADO, nao paradas confirmadas por GPS', () => {
    const l = montarLinhaDashboardDiaria(linhaKpi(), '2026-09-01')
    expect(l).toMatchObject({
      data: '2026-09-01', placa: 'TOS1H26', rota: 'CAMPOS', notas: 37, km: 196.3,
      saidaBase: '2026-09-01T10:59:00Z', chegadaBase: '2026-09-01T23:58:00Z',
    })
    expect(l.notasPorHora).toBeCloseTo(2.8498074454428757, 6)
  })

  // "ERRO DE CADASTRO" no romaneio real (RGU5G33, 01/09): sem saida/chegada
  // de base, sem km, sem tempo em rota -- notas/hora fica null (SEM DADO),
  // nunca inventa.
  it('placa sem horario de base valido: notasPorHora null, mesmo com NF planejado preenchido', () => {
    const l = montarLinhaDashboardDiaria(linhaKpi({ nfPlanejado: 28, tempoOperacaoMin: null, saidaCd: null, chegadaCd: null, kmPercorrido: null }), '2026-09-01')
    expect(l.notasPorHora).toBeNull()
  })
})

describe('atribuirRankEPerformance (achado real: planilha 01/09 da Nutry Max, 74 saidas, 1 SEM DADO)', () => {
  // Reproduz o formato real: 73 saidas com notasPorHora distintos (values
  // decrescentes, 4.12 .. 0.32, batendo com a coluna NOTAS/HORA real) + 1
  // sem dado (ERRO DE CADASTRO).
  function linhaComNotasPorHora(id: string, notasPorHora: number): LinhaDashboardDiaria {
    return {
      data: '2026-09-01', placa: id, rota: 'X', notas: 10, saidaBase: '2026-09-01T10:00:00Z',
      chegadaBase: '2026-09-01T20:00:00Z', km: 50, motorista: id, ajudante1: null, ajudante2: null,
      tempoEmRotaMin: 600, notasPorHora,
    }
  }
  const semDado: LinhaDashboardDiaria = {
    data: '2026-09-01', placa: 'RGU5G33', rota: 'TERESOPOLIS', notas: 28, saidaBase: null, chegadaBase: null,
    km: null, motorista: 'WALLACE', ajudante1: 'CARLOS', ajudante2: null, tempoEmRotaMin: null, notasPorHora: null,
  }
  // 73 valores unicos decrescentes (nao precisam ser os reais, so' unicos e ordenaveis)
  const linhas = [...Array(73)].map((_, i) => linhaComNotasPorHora(`P${i}`, 73 - i)).concat(semDado)

  it('73 linhas com dado -> rank 1..73, corte de quartil EXATO 19/18/18/18 (achado real)', () => {
    const r = atribuirRankEPerformance(linhas)
    const comRank = r.filter(l => l.rankDia != null).sort((a, b) => (a.rankDia as number) - (b.rankDia as number))
    expect(comRank).toHaveLength(73)
    expect(comRank[0].placa).toBe('P0') // maior notasPorHora (73)
    expect(comRank[0].rankDia).toBe(1)
    expect(comRank.filter(l => l.performance === 'MELHOR PERFORMANCE')).toHaveLength(19)
    expect(comRank.filter(l => l.performance === 'BOA PERFORMANCE')).toHaveLength(18)
    expect(comRank.filter(l => l.performance === 'REGULAR')).toHaveLength(18)
    expect(comRank.filter(l => l.performance === 'ATENÇÃO')).toHaveLength(18)
    // fronteiras exatas: rank 19 ainda MELHOR, rank 20 ja' BOA
    expect(comRank[18].performance).toBe('MELHOR PERFORMANCE') // rank 19 (indice 18)
    expect(comRank[19].performance).toBe('BOA PERFORMANCE') // rank 20 (indice 19)
    expect(comRank[36].performance).toBe('BOA PERFORMANCE') // rank 37
    expect(comRank[37].performance).toBe('REGULAR') // rank 38
    expect(comRank[54].performance).toBe('REGULAR') // rank 55
    expect(comRank[55].performance).toBe('ATENÇÃO') // rank 56
  })

  it('linha sem dado (horario invalido): sem rank, selo SEM DADO, nunca entra no ranking', () => {
    const r = atribuirRankEPerformance(linhas)
    const semDadoResult = r.find(l => l.placa === 'RGU5G33')!
    expect(semDadoResult.rankDia).toBeNull()
    expect(semDadoResult.performance).toBe('SEM DADO')
  })

  it('lista vazia: nao quebra', () => {
    expect(atribuirRankEPerformance([])).toEqual([])
  })

  it('so uma linha com dado: rank 1, MELHOR PERFORMANCE (unico grupo)', () => {
    const r = atribuirRankEPerformance([linhaComNotasPorHora('A', 5)])
    expect(r[0]).toMatchObject({ rankDia: 1, performance: 'MELHOR PERFORMANCE' })
  })
})

describe('agregarEquipeSemanal (achado real: planilha PERFORMANCE da Nutry Max)', () => {
  function saida(over: Partial<LinhaDashboardComRank> & { motorista: string }): LinhaDashboardComRank {
    return {
      data: '2026-09-01', placa: 'X', rota: 'ROTA', notas: 10, saidaBase: null, chegadaBase: null, km: 50,
      ajudante1: null, ajudante2: null, tempoEmRotaMin: 300, notasPorHora: 2, rankDia: 1, performance: 'MELHOR PERFORMANCE',
      ...over,
    }
  }

  // Achado real (planilha PERFORMANCE, linha WALLACE DE LIMA MORAIS DA
  // SILVA / CARLOS ALBERTO OLIVEIRA GOMES): 4 rotas na semana, so' 2 com
  // dado valido -> cobertura 0,5 -- TOTAL NOTAS soma as 4 (127, inclusive
  // as sem hora valida), NOTAS VÁLIDAS KPI so' soma as 2 com dado (75).
  // RANKING fica null e PERFORMANCE vira "DADOS INCOMPLETOS", nunca entra
  // no ranking (usuario: "evita distorcoes").
  it('equipe com cobertura incompleta: fora do ranking, mas total/validas calculados certo', () => {
    const equipe = 'WALLACE DE LIMA MORAIS DA SILVA'
    const ajudante = 'CARLOS ALBERTO OLIVEIRA GOMES'
    const linhas = [
      saida({ motorista: equipe, ajudante1: ajudante, notas: 40, tempoEmRotaMin: 600, notasPorHora: 4, rankDia: 1, performance: 'MELHOR PERFORMANCE' }),
      saida({ motorista: equipe, ajudante1: ajudante, notas: 35, tempoEmRotaMin: 720, notasPorHora: 2.9, rankDia: 2, performance: 'BOA PERFORMANCE' }),
      saida({ motorista: equipe, ajudante1: ajudante, notas: 30, tempoEmRotaMin: null, notasPorHora: null, rankDia: null, performance: 'SEM DADO' }),
      saida({ motorista: equipe, ajudante1: ajudante, notas: 22, tempoEmRotaMin: null, notasPorHora: null, rankDia: null, performance: 'SEM DADO' }),
    ]
    const [r] = agregarEquipeSemanal(linhas)
    expect(r).toMatchObject({
      motorista: equipe, ajudante1: ajudante, rotas: 4, rotasComDado: 2, cobertura: 0.5,
      totalNotas: 127, notasValidasKpi: 75, ranking: null, performance: 'DADOS INCOMPLETOS',
    })
    expect(r.notasPorHora).not.toBeNull() // ainda calcula, so nao entra no ranking
  })

  it('equipe sem NENHUM dado valido: cobertura 0, notasPorHora null, DADOS INCOMPLETOS', () => {
    const linhas = [saida({ motorista: 'JORGE', tempoEmRotaMin: null, notasPorHora: null, rankDia: null, performance: 'SEM DADO' })]
    const [r] = agregarEquipeSemanal(linhas)
    expect(r).toMatchObject({ rotas: 1, rotasComDado: 0, cobertura: 0, notasPorHora: null, ranking: null, performance: 'DADOS INCOMPLETOS' })
  })

  it('so equipes com cobertura=1 competem pelo ranking e pelo quartil (achado real: 125 equipes, 32/31/31/31)', () => {
    const cobertura1 = [...Array(125)].map((_, i) =>
      saida({ motorista: `M${i}`, notasPorHora: 125 - i, rankDia: 1, performance: 'MELHOR PERFORMANCE' })
    )
    const incompleta = saida({ motorista: 'INCOMPLETO', tempoEmRotaMin: null, notasPorHora: null, rankDia: null, performance: 'SEM DADO' })
    const r = agregarEquipeSemanal([...cobertura1, incompleta])
    const semRanking = r.find(e => e.motorista === 'INCOMPLETO')!
    expect(semRanking.ranking).toBeNull()
    expect(semRanking.performance).toBe('DADOS INCOMPLETOS')
    const ranqueadas = r.filter(e => e.ranking != null)
    expect(ranqueadas).toHaveLength(125)
    const porTier = new Map<string, number>()
    for (const e of ranqueadas) porTier.set(e.performance, (porTier.get(e.performance) ?? 0) + 1)
    expect(porTier.get('MELHOR PERFORMANCE')).toBe(32)
    expect(porTier.get('BOA PERFORMANCE')).toBe(31)
    expect(porTier.get('REGULAR')).toBe(31)
    expect(porTier.get('ATENÇÃO')).toBe(31)
  })

  it('equipe diferente so por causa do ajudante 2: agrega separado (chave = motorista+ajudante1+ajudante2)', () => {
    const linhas = [
      saida({ motorista: 'M', ajudante1: 'A1', ajudante2: null, notas: 10 }),
      saida({ motorista: 'M', ajudante1: 'A1', ajudante2: 'A2', notas: 20 }),
    ]
    const r = agregarEquipeSemanal(linhas)
    expect(r).toHaveLength(2)
  })
})

describe('montarResumoPeriodo', () => {
  function saidaDia(over: Partial<LinhaDashboardDiaria> = {}): LinhaDashboardDiaria {
    return {
      data: '2026-09-01', placa: 'X', rota: 'R', notas: 10, saidaBase: '2026-09-01T10:00:00Z',
      chegadaBase: '2026-09-01T20:00:00Z', km: 50, motorista: 'M', ajudante1: null, ajudante2: null,
      tempoEmRotaMin: 600, notasPorHora: 1,
      ...over,
    }
  }

  it('soma notas/km/horas so das saidas com dado valido, media notas/hora bate com soma/soma', () => {
    const r = montarResumoPeriodo([
      saidaDia({ notas: 40, km: 100, tempoEmRotaMin: 600 }),
      saidaDia({ notas: 30, km: 50, tempoEmRotaMin: 300 }),
    ])
    expect(r.saidasEmRota).toBe(2)
    expect(r.notasEntregues).toBe(70)
    expect(r.kmPercorridos).toBe(150)
    expect(r.horasEmOperacao).toBe(15)
    expect(r.mediaNotasPorHora).toBeCloseTo(70 / 15, 6)
  })

  it('saida sem dado valido nao entra nas somas, mas conta no denominador da cobertura', () => {
    const r = montarResumoPeriodo([
      saidaDia(),
      saidaDia({ notasPorHora: null, tempoEmRotaMin: null, saidaBase: null, chegadaBase: null }),
    ])
    expect(r.saidasEmRota).toBe(1)
    expect(r.coberturaRastreamento).toBe(0.5)
  })

  it('lista vazia: tudo zero/null, nunca divide por zero', () => {
    const r = montarResumoPeriodo([])
    expect(r).toMatchObject({ saidasEmRota: 0, notasEntregues: 0, mediaNotasPorHora: null, coberturaRastreamento: null })
  })
})
