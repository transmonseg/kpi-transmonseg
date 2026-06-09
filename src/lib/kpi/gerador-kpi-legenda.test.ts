import { describe, it, expect } from 'vitest'
import { legendaSlot, celulasSlot } from './gerador-kpi'
import type { LinhaParaKpi } from './gerador-kpi'

function linha(p: Partial<LinhaParaKpi>): LinhaParaKpi {
  return {
    kpi_id: 'x', escala_linha_id: null, ordem: 1, loja_nome: 'L', motorista: null, placa: 'ABC1D23',
    carro_ordem: 1, saida_cd: null, chd_loja_1: null, saida_loja_1: null, tempo_loja_1_min: null,
    chd_loja_2: null, saida_loja_2: null, tempo_loja_2_min: null, chd_loja_3: null, saida_loja_3: null,
    tempo_loja_3_min: null, observacao: null, anomalias_codigos: [], ...p,
  }
}

describe('legendaSlot — legenda do KPI gerado', () => {
  it('entregou nesta loja (tem chd) → sem legenda (mostra horários)', () => {
    expect(legendaSlot(linha({ chd_loja_1: new Date(), placa_rastreada: true }))).toBeNull()
  })
  it('placa NÃO rastreada (ausente do Unitrac) → SEM RASTREADOR', () => {
    expect(legendaSlot(linha({ placa_rastreada: false }))).toBe('SEM RASTREADOR')
  })
  it('placa rastreada e foi a alguma loja, mas não nesta → MUDOU DE ROTA - CONFERIR', () => {
    expect(legendaSlot(linha({ placa_rastreada: true, placa_foi_algum_lugar: true }))).toBe('MUDOU DE ROTA - CONFERIR')
  })
  it('placa rastreada mas só ficou na base (não saiu do CD) → NÃO SAIU DA BASE', () => {
    expect(legendaSlot(linha({ placa_rastreada: true, placa_foi_algum_lugar: false, placa_saiu_da_base: false }))).toBe('NÃO SAIU DA BASE')
  })
  it('placa rastreada, saiu da base mas sem entrega confirmada → NÃO FOI AO CLIENTE', () => {
    expect(legendaSlot(linha({ placa_rastreada: true, placa_foi_algum_lugar: false, placa_saiu_da_base: true }))).toBe('NÃO FOI AO CLIENTE')
  })
  it('slot vazio (carro nulo) → null', () => {
    expect(legendaSlot(null)).toBeNull()
  })
})

describe('celulasSlot — células de tempo (SAÍDA CD / CHD / SAÍDA)', () => {
  // BRT mascarado como UTC (convenção do sistema). 15:04 BRT.
  const saida1504 = new Date(Date.UTC(2026, 5, 9, 15, 4))

  it('relatório parcial: mostra a saída de base na SAÍDA CD e "RELATÓRIO PARCIAL" nas demais', () => {
    const c = linha({ relatorio_parcial: true, saida_base_parcial: saida1504, chd_loja_1: null, placa_rastreada: true })
    const [cd, chd, sai] = celulasSlot(c, null, null, null)
    expect(typeof cd).toBe('number')          // saída de base (fração do dia Excel)
    expect(chd).toBe('RELATÓRIO PARCIAL')
    expect(sai).toBe('')
  })

  it('sem entrega comum: repete a legenda nas 3 células (não é parcial)', () => {
    const c = linha({ placa_rastreada: true, placa_foi_algum_lugar: true })
    const [cd, chd, sai] = celulasSlot(c, null, null, null)
    expect(cd).toBe('MUDOU DE ROTA - CONFERIR')
    expect(chd).toBe('MUDOU DE ROTA - CONFERIR')
    expect(sai).toBe('MUDOU DE ROTA - CONFERIR')
  })

  it('entregue: usa os horários passados (sem legenda)', () => {
    const c = linha({ chd_loja_1: new Date(), placa_rastreada: true })
    const [cd, chd, sai] = celulasSlot(c, 0.5, 0.6, 0.7)
    expect([cd, chd, sai]).toEqual([0.5, 0.6, 0.7])
  })
})
