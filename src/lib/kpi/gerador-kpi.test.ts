import { describe, it, expect } from 'vitest'
import { calcTempoOperacao, COL_TEMPO_OPERACAO, legendaSlot, type LinhaParaKpi } from './gerador-kpi'

const baseLinha = (o: Partial<LinhaParaKpi>): LinhaParaKpi => ({
  rede_id: 'ASSAI', loja: 'X', placa: 'ABC1234', motorista: null, turno: 'MANHA',
  saida_cd: null, chd_loja_1: null, saida_loja_1: null, rota_status: 'sem_entrega',
  placa_rastreada: true, ...o,
} as unknown as LinhaParaKpi)

describe('legendaSlot — relatório cedo', () => {
  it('cedo + saiu da base, sem entrega → EM ROTA (não "não foi")', () => {
    expect(legendaSlot(baseLinha({ relatorio_cedo: true, placa_saiu_da_base: true, placa_foi_algum_lugar: false }))).toBe('EM ROTA')
  })
  it('cedo + não saiu da base → AGUARDANDO BASE', () => {
    expect(legendaSlot(baseLinha({ relatorio_cedo: true, placa_saiu_da_base: false }))).toBe('AGUARDANDO BASE')
  })
  it('cedo + placa fora do relatório → SEM RASTREADOR', () => {
    expect(legendaSlot(baseLinha({ relatorio_cedo: true, placa_rastreada: false }))).toBe('SEM RASTREADOR')
  })
  it('NÃO cedo, saiu da base, sem entrega → continua NÃO FOI AO CLIENTE', () => {
    expect(legendaSlot(baseLinha({ relatorio_cedo: false, placa_saiu_da_base: true, placa_foi_algum_lugar: false }))).toBe('NÃO FOI AO CLIENTE')
  })
  it('com entrega (chd != null) → null mesmo cedo', () => {
    expect(legendaSlot(baseLinha({ relatorio_cedo: true, chd_loja_1: new Date('2026-06-13T05:00:00Z') }))).toBeNull()
  })
  it('placa desatualizada → DESATUALIZADO (não SEM RASTREADOR)', () => {
    expect(legendaSlot(baseLinha({ placa_rastreada: false, placa_desatualizada: true }))).toBe('DESATUALIZADO')
  })
})

describe('calcTempoOperacao', () => {
  it('volta menos saída da base em min e HH:MM', () => {
    const r = calcTempoOperacao(new Date('2026-05-19T05:00:00Z'), new Date('2026-05-19T13:00:00Z'))
    expect(r).toEqual({ min: 480, fmt: '08:00' })
  })
  it('cruza meia-noite', () => {
    const r = calcTempoOperacao(new Date('2026-05-19T23:00:00Z'), new Date('2026-05-19T01:30:00Z'))
    expect(r).toEqual({ min: 150, fmt: '02:30' })
  })
  it('null quando falta dado', () => {
    expect(calcTempoOperacao(null, new Date())).toBeNull()
    expect(calcTempoOperacao(new Date(), null)).toBeNull()
  })
  it('flag desligada (não lança ainda)', () => {
    expect(COL_TEMPO_OPERACAO).toBe(false)
  })
})
