import { describe, it, expect } from 'vitest'
import { legendaSlot } from './gerador-kpi'
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
  it('placa rastreada e foi a alguma loja, mas não nesta → MUDOU DE ROTA', () => {
    expect(legendaSlot(linha({ placa_rastreada: true, placa_foi_algum_lugar: true }))).toBe('MUDOU DE ROTA')
  })
  it('placa rastreada e NÃO foi a loja nenhuma (ficou na base) → NÃO FOI AO CLIENTE', () => {
    expect(legendaSlot(linha({ placa_rastreada: true, placa_foi_algum_lugar: false }))).toBe('NÃO FOI AO CLIENTE')
  })
  it('slot vazio (carro nulo) → null', () => {
    expect(legendaSlot(null)).toBeNull()
  })
})
