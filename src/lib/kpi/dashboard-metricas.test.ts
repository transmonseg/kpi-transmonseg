import { describe, it, expect } from 'vitest'
import { filtrar, calcularMetricas } from './dashboard-metricas'
import type { EntradaManual } from './parse-kpi-manual'

const E = (o: Partial<EntradaManual>): EntradaManual => ({
  rede_id: 'PRINCESA', data: '2026-05-19', loja: 'L', placa: 'P', motorista: 'M',
  status: 'entregue', saida_cd: '05:00', chd: '06:00', sai: '06:30', ...o,
})
const ents: EntradaManual[] = [
  E({ rede_id: 'PRINCESA', loja: 'A', chd: '06:00', sai: '06:30' }),
  E({ rede_id: 'PRINCESA', loja: 'B', status: 'sem_rastreador', chd: null, sai: null }),
  E({ rede_id: 'ASSAI', loja: 'C', status: 'nao_foi', chd: null, sai: null }),
  E({ rede_id: 'ASSAI', data: '2026-05-20', loja: 'C', chd: '05:00', sai: '05:40' }),
]

describe('filtrar', () => {
  it('por redes (multi)', () => { expect(filtrar(ents, { redes: ['ASSAI'] }).length).toBe(2) })
  it('por intervalo', () => { expect(filtrar(ents, { de: '2026-05-20', ate: '2026-05-20' }).length).toBe(1) })
  it('sem filtro retorna tudo', () => { expect(filtrar(ents, {}).length).toBe(4) })
})

describe('calcularMetricas', () => {
  it('totais, rede, serie, turno, tempo', () => {
    const m = calcularMetricas(ents)
    expect(m.total).toBe(4)
    expect(m.entregue).toBe(2)
    expect(m.nao_foi).toBe(1)
    expect(m.sem_rastreador).toBe(1)
    expect(m.com_rastreador).toBe(3)
    expect(m.pctEntregue).toBe(50)
    expect(m.tempoMedioLojaMin).toBe(35) // (30 + 40)/2
    expect(m.porRede.find(r => r.rede_id === 'PRINCESA')!.total).toBe(2)
    expect(m.serie.find(s => s.data === '2026-05-19')!.entregue).toBe(1)
    expect(m.turnos.manha).toBe(1)      // 06:00
    expect(m.turnos.madrugada).toBe(1)  // 05:00
    expect(m.topSemRastreador[0].loja).toBe('B')
  })
})

describe('calcularMetricas — novos campos de tempo', () => {
  const E2 = (o: Partial<EntradaManual>): EntradaManual => ({
    rede_id: 'PRINCESA', data: '2026-05-19', loja: 'A',
    placa: 'ABC1234', motorista: 'JOAO',
    status: 'entregue', saida_cd: '04:00', chd: '05:30', sai: '06:00', ...o,
  })

  const ents2: EntradaManual[] = [
    E2({ loja: 'A', saida_cd: '04:00', chd: '05:30', sai: '06:00' }),
    E2({ loja: 'B', saida_cd: '04:00', chd: '06:00', sai: '07:00' }),
    E2({ loja: 'A', saida_cd: '04:00', chd: '05:30', sai: '06:00', data: '2026-05-20' }),
    E2({ loja: 'C', status: 'sem_rastreador', saida_cd: null, chd: null, sai: null }),
    E2({ loja: 'D', status: 'nao_foi', saida_cd: '05:00', chd: null, sai: null }),
    E2({ loja: 'E', motorista: 'JOSE', saida_cd: '05:00', chd: '06:00', sai: '06:30' }),
  ]

  it('tempoMedioRotaMin: media de saida_cd→chd (so entregues)', () => {
    const m = calcularMetricas(ents2)
    expect(m.tempoMedioRotaMin).toBe(90)
  })

  it('tempoMedioTotalMin: media de saida_cd→sai (so entregues)', () => {
    const m = calcularMetricas(ents2)
    expect(m.tempoMedioTotalMin).toBe(128)
  })

  it('distHorarioSaida: agrupa por hora de saida_cd', () => {
    const m = calcularMetricas(ents2)
    const h4 = m.distHorarioSaida.find(h => h.hora === 4)!
    const h5 = m.distHorarioSaida.find(h => h.hora === 5)!
    expect(h4.entregas).toBe(3) // entradas com saida_cd 04:00: lojas A, B, A (qualquer status)
    expect(h5.entregas).toBe(2) // saida_cd 05:00: loja D (nao_foi) + loja E (entregue)
    expect(m.distHorarioSaida).toHaveLength(24)
  })

  it('topRotasDemoradas: top lojas por tempo_rota decrescente (min 2 pontos)', () => {
    const m = calcularMetricas(ents2)
    expect(m.topRotasDemoradas[0].loja).toBe('A')
    expect(m.topRotasDemoradas[0].tempo_rota).toBe(90)
  })

  it('topMotoristas: top por entregas (entregues com motorista)', () => {
    const m = calcularMetricas(ents2)
    const joao = m.topMotoristas.find(x => x.motorista === 'JOAO')!
    expect(joao.entregas).toBe(3) // JOAO tem 3 entregues; loja C e sem_rastreador, loja D e nao_foi
  })

  it('serieTempos: avg de tempos por dia', () => {
    const m = calcularMetricas(ents2)
    const d19 = m.serieTempos.find(s => s.data === '2026-05-19')!
    expect(d19.tempo_rota).toBe(90)
    expect(d19.tempo_loja).toBe(40)
    expect(d19.tempo_total).toBe(130)
  })

  it('porClienteComTempos: por rede com avg tempos e lojas únicas', () => {
    const m = calcularMetricas(ents2)
    const princesa = m.porClienteComTempos.find(c => c.rede_id === 'PRINCESA')!
    expect(princesa.entregas).toBe(6)
    expect(princesa.lojas).toBe(5)
    expect(typeof princesa.tempo_rota).toBe('number')
  })
})
