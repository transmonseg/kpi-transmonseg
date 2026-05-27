import { describe, it, expect } from 'vitest'
import { agruparPorLoja } from './agrupar-por-loja'
import type { LinhaParaKpi } from './gerador-kpi'

function stub(overrides: Partial<LinhaParaKpi>): LinhaParaKpi {
  return {
    kpi_id: 'k',
    escala_linha_id: 'e',
    ordem: 1,
    loja_nome: 'X',
    motorista: 'M',
    placa: 'AAA1234',
    carro_ordem: 1,
    saida_cd: null,
    chd_loja_1: null,
    saida_loja_1: null,
    tempo_loja_1_min: null,
    chd_loja_2: null,
    saida_loja_2: null,
    tempo_loja_2_min: null,
    chd_loja_3: null,
    saida_loja_3: null,
    tempo_loja_3_min: null,
    observacao: null,
    anomalias_codigos: [],
    ...overrides,
  }
}

describe('agruparPorLoja', () => {
  it('1 linha mesma loja: carro1 preenchido, carro2 null', () => {
    const linhas = [stub({ loja_nome: 'L', motorista: 'A', carro_ordem: 1 })]
    const out = agruparPorLoja(linhas)
    expect(out).toHaveLength(1)
    expect(out[0].carro1?.motorista).toBe('A')
    expect(out[0].carro2).toBeNull()
  })

  it('2 linhas mesma loja com carro_ordem 1 e 2: cada um vai pro seu slot', () => {
    const linhas = [
      stub({ loja_nome: 'L', motorista: 'A', carro_ordem: 1 }),
      stub({ loja_nome: 'L', motorista: 'B', carro_ordem: 2 }),
    ]
    const out = agruparPorLoja(linhas)
    expect(out).toHaveLength(1)
    expect(out[0].carro1?.motorista).toBe('A')
    expect(out[0].carro2?.motorista).toBe('B')
  })

  it('2 linhas mesma loja com carro_ordem 2 e 1 (ordem invertida): cada um vai pro seu slot', () => {
    const linhas = [
      stub({ loja_nome: 'L', motorista: 'B', carro_ordem: 2 }),
      stub({ loja_nome: 'L', motorista: 'A', carro_ordem: 1 }),
    ]
    const out = agruparPorLoja(linhas)
    expect(out[0].carro1?.motorista).toBe('A')
    expect(out[0].carro2?.motorista).toBe('B')
  })

  it('BUG 5 — 2 linhas mesma loja AMBAS carro_ordem=1: preserva ambas (carro1+carro2)', () => {
    // Caso real: ZS Loja 31 1ª dia 19 — DBB-8D19 PAULO HENRIQUE + LTE-0A64 DOUGLAS
    // Ambas linhas têm carro_ordem=1 (parser ZS hardcoda 1). Sem fix, segunda
    // sobrescreve primeira no agrupador e some do KPI.
    const linhas = [
      stub({ loja_nome: 'Zona Sul Loja 31', motorista: 'PAULO HENRIQUE', placa: 'DBB8D19', carro_ordem: 1 }),
      stub({ loja_nome: 'Zona Sul Loja 31', motorista: 'DOUGLAS', placa: 'LTE0A64', carro_ordem: 1 }),
    ]
    const out = agruparPorLoja(linhas)
    expect(out).toHaveLength(1)
    const motoristas = [out[0].carro1?.motorista, out[0].carro2?.motorista].filter(Boolean)
    expect(motoristas).toHaveLength(2)
    expect(motoristas).toContain('PAULO HENRIQUE')
    expect(motoristas).toContain('DOUGLAS')
  })

  it('BUG 5 — 3 linhas mesma loja todas carro_ordem=1: preserva pelo menos 2 distintas', () => {
    // Caso real: ZS MEGA BOX 02 dia 19 — KOP4978 MILTON + LNU7733 PAULO CESAR + AKZ2594 NILTON
    const linhas = [
      stub({ loja_nome: 'MEGA BOX 02', motorista: 'MILTON', placa: 'KOP4978', carro_ordem: 1 }),
      stub({ loja_nome: 'MEGA BOX 02', motorista: 'PAULO CESAR', placa: 'LNU7733', carro_ordem: 1 }),
      stub({ loja_nome: 'MEGA BOX 02', motorista: 'NILTON', placa: 'AKZ2594', carro_ordem: 1 }),
    ]
    const out = agruparPorLoja(linhas)
    expect(out).toHaveLength(1)
    const motoristas = [out[0].carro1?.motorista, out[0].carro2?.motorista].filter(Boolean)
    expect(motoristas.length).toBeGreaterThanOrEqual(2)
    // Primeira linha SEMPRE preservada
    expect(motoristas[0]).toBe('MILTON')
  })

  it('2 linhas LOJAS DIFERENTES: cria 2 entradas distintas', () => {
    const linhas = [
      stub({ loja_nome: 'Loja A', motorista: 'X', carro_ordem: 1 }),
      stub({ loja_nome: 'Loja B', motorista: 'Y', carro_ordem: 1 }),
    ]
    const out = agruparPorLoja(linhas)
    expect(out).toHaveLength(2)
    expect(out.find(g => g.loja_nome === 'Loja A')?.carro1?.motorista).toBe('X')
    expect(out.find(g => g.loja_nome === 'Loja B')?.carro1?.motorista).toBe('Y')
  })

  it('2 linhas mesma loja AMBAS carro_ordem=2: preserva ambas (carro1+carro2)', () => {
    // Cenário simétrico — improvável mas a regra é simétrica
    const linhas = [
      stub({ loja_nome: 'L', motorista: 'A', carro_ordem: 2 }),
      stub({ loja_nome: 'L', motorista: 'B', carro_ordem: 2 }),
    ]
    const out = agruparPorLoja(linhas)
    const motoristas = [out[0].carro1?.motorista, out[0].carro2?.motorista].filter(Boolean)
    expect(motoristas).toHaveLength(2)
  })
})
