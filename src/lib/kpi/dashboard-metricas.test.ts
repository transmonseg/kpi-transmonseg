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
