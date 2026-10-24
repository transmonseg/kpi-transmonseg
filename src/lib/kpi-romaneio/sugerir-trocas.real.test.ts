// Casos REAIS de 15, 16, 17 e 22/10/2026 (plano mestre 23/10, F1-02, F1-03 e
// F1-04). Fixture só leitura: escala crua (sem as trocas que a operação
// registrou depois), pontos geocodificados e paradas FORA_BASE da Unitrac/ponte
// -- ver `_fonte` no JSON.
import { describe, it, expect } from 'vitest'
import fixture from './sugerir-trocas.fixture-2026-10.json'
import { sugerirTrocas, type SugestaoTroca, type TrocaConfirmada } from './sugerir-trocas'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

type Dia = { alvos: string[]; pontos: [string, string, number, number, number][]; paradas: Record<string, [number, number][]> }

function sugestoesDo(data: string, opcoes: { semHistorico?: boolean } = {}): SugestaoTroca[] {
  const dia = (fixture.dias as unknown as Record<string, Dia>)[data]
  const pontos = dia.pontos.map(([carga, placa, e, lat, lng]) => ({ carga, placa, endereco: `E${e}`, lat, lng }))
  const paradas = new Map(Object.entries(dia.paradas).map(([placa, ps]) => [placa, ps.map(([lat, lng], i) => ({
    id: `${placa}-${i}`, placa_norm: placa, classificacao: 'FORA_BASE', lat, lng, chegada: `${data}T10:00:00Z`, saida: `${data}T10:10:00Z`,
  }) as unknown as UnitracParadaRow)]))
  const historico = (fixture.historico as TrocaConfirmada[]).filter(t => t.data < data)
  return sugerirTrocas(pontos, paradas, { frota: fixture.frota, historico: opcoes.semHistorico ? [] : historico })
    .filter(s => dia.alvos.includes(s.carga))
}
const resumo = (s: SugestaoTroca) => `${s.carga} ${s.placaEscala || '(sem placa)'}${s.modo === 'mutua' ? '<->' : '->'}${s.placaSugerida}`

describe('F1-02 (KN-02): troca mútua e carga absorvida -- casos reais', () => {
  it('15/10: RQV9E37 -> RQV3G18 (Campos) continua', () => {
    expect(sugestoesDo('2026-10-15').map(resumo)).toContain('100102 RQV9E37->RQV3G18')
  })

  it('16/10: TOS0G53 x RBI0J25 e RBG8J72 x RBG4F53 saem como troca mútua (uma vez cada par)', () => {
    const s = sugestoesDo('2026-10-16')
    expect(s.filter(x => x.modo === 'mutua').map(resumo)).toEqual(['100206 RBI0J25<->TOS0G53', '100216 RBG4F53<->RBG8J72'])
    // o outro lado do par não aparece como redirecionamento solto
    expect(s.map(resumo)).not.toContain('100207 TOS0G53->RBI0J25')
    expect(s.map(resumo)).not.toContain('100224 RBG8J72->RBG4F53')
    expect(s.find(x => x.carga === '100206')).toMatchObject({ motivo: 'mutua', enderecosVisitados: 24, enderecosDaCarga: 27 })
  })

  it('17/10: UNN6G81 <-> RQV5F67 (mútua) e RBG8J72 -> RBG4F53 (carro sem carga)', () => {
    const s = sugestoesDo('2026-10-17')
    expect(s.map(resumo)).toEqual(expect.arrayContaining(['100308 UNN6G81<->RQV5F67', '100309 RBG8J72->RBG4F53']))
    expect(s.find(x => x.carga === '100308')).toMatchObject({ enderecosVisitados: 19, enderecosDaCarga: 21 })
    expect(s.find(x => x.carga === '100309')).toMatchObject({ motivo: 'livre', modo: 'redirecionar' })
  })
})

describe('F1-03 (KN-01): carga do pão sem placa -- casos reais', () => {
  it('22/10: PAO-6 sugere RQM4C16 (6 de 6) e PAO-1 sugere RBI1J86', () => {
    const s = sugestoesDo('2026-10-22')
    expect(s.find(x => x.carga === 'PAO-6')).toMatchObject({ placaEscala: '', placaSugerida: 'RQM4C16', enderecosVisitados: 6, enderecosDaCarga: 6, motivo: 'sem_placa', modo: 'redirecionar' })
    expect(s.find(x => x.carga === 'PAO-1')).toMatchObject({ placaEscala: '', placaSugerida: 'RBI1J86', motivo: 'sem_placa' })
  })

  it('15/10: PAO-1/RBI1J86 e PAO-6/RQM4C16; 16/10: PAO-5/RQM4C16', () => {
    expect(sugestoesDo('2026-10-15').map(resumo)).toEqual(expect.arrayContaining(['PAO-1 (sem placa)->RBI1J86', 'PAO-6 (sem placa)->RQM4C16']))
    expect(sugestoesDo('2026-10-16').map(resumo)).toContain('PAO-5 (sem placa)->RQM4C16')
  })

  it('22/10 PAO-6: o carro já confirmado para a PAO-6 (trocas 28 e 39, TTI6E49 -> RQM4C16) conta como confirmado antes', () => {
    expect(sugestoesDo('2026-10-22').find(x => x.carga === 'PAO-6')?.confirmadaAntes).toBe(2)
  })
})

describe('F1-04 (KN-03 a/b): placa digitada errada no pão -- casos reais', () => {
  it('16/10 PAO-7 RQO5E38 (fora da frota) sugere TOS5E38', () => {
    expect(sugestoesDo('2026-10-16').find(x => x.carga === 'PAO-7')).toMatchObject({ placaEscala: 'RQO5E38', placaSugerida: 'TOS5E38', motivo: 'fora_da_frota', enderecosVisitados: 8, enderecosDaCarga: 9 })
  })

  it('16/10 PAO-7: sem nenhum histórico ainda sugere TOS5E38 (final 5E38 único na frota + GPS)', () => {
    expect(sugestoesDo('2026-10-16', { semHistorico: true }).find(x => x.carga === 'PAO-7')?.placaSugerida).toBe('TOS5E38')
  })

  it('22/10 PAO-9 RQO5E38 -> TOS5E38 é "troca recorrente" (confirmada em 15 e 21/10)', () => {
    expect(sugestoesDo('2026-10-22').find(x => x.carga === 'PAO-9')).toMatchObject({ placaSugerida: 'TOS5E38', recorrente: true, confirmadaAntes: 2 })
  })

  it('15/10 PAO-2 RQU8A12 sugere RQV8A12 (fora da frota)', () => {
    expect(sugestoesDo('2026-10-15').find(x => x.carga === 'PAO-2')).toMatchObject({ placaSugerida: 'RQV8A12', motivo: 'fora_da_frota' })
  })

  it('22/10 PAO-1 (carro 36): sugere RBI1J86 pelo GPS, nunca TTI9B98 (fora da frota)', () => {
    const s = sugestoesDo('2026-10-22').find(x => x.carga === 'PAO-1')
    expect(s?.placaSugerida).toBe('RBI1J86')
  })

  it('17/10 carga 100377 TTI9B98 (fora da frota) sugere RBI1J86, já confirmado em 26/09 e 08/10', () => {
    expect(sugestoesDo('2026-10-17').find(x => x.carga === '100377')).toMatchObject({ placaSugerida: 'RBI1J86', motivo: 'fora_da_frota', recorrente: true })
  })
})
