import { describe, it, expect } from 'vitest'
import { evidenciasDoDia, escolherLocal } from './aprender-locais'
import type { LinhaDetalheEntrega } from './types'

const det = (o: Partial<LinhaDetalheEntrega>): LinhaDetalheEntrega => ({
  carga: '99001', placa: 'AAA1A11', motorista: 'M', clienteCodigo: '100', nf: '1', clienteNome: 'C', endereco: 'RUA A, 1 - X, RIO DE JANEIRO - * - 20000000',
  saidaCd: null, chegadaCd: null, tempoOperacaoMin: null, chegada: null, saida: null, tempoParadaMin: null,
  status: 'confirmado_gps', temRastreador: true, observacao: null, evidencia: 'parada_no_endereco', distParadaM: 80, ...o,
} as LinhaDetalheEntrega)
const parada = (lat: number, lng: number, min: number) => ({ chegada: '2026-10-05T12:00:00Z', saida: '2026-10-05T12:30:00Z', duracaoSeg: min * 60, lat, lng, classificacao: 'FORA_BASE' as const })

describe('evidenciasDoDia', () => {
  it('entrega confirmada pela parada no endereço (até 300 m) vira evidência do local do cliente', () => {
    const ev = evidenciasDoDia({ detalhe: [det({})], geo: new Map([['1', { lat: -22.9, lng: -43.2, confiavel: true }]]), paradasPorPlaca: new Map(), indep: new Map() })
    expect(ev).toEqual([expect.objectContaining({ chave: '100', origem: 'entrega_confirmada', lat: -22.9, lng: -43.2 })])
  })
  it('confirmação fraca (longe, vizinhança, geocode não confiável) não ensina nada', () => {
    const geo = new Map([['1', { lat: -22.9, lng: -43.2, confiavel: true }]])
    expect(evidenciasDoDia({ detalhe: [det({ distParadaM: 600 })], geo, paradasPorPlaca: new Map(), indep: new Map() })).toEqual([])
    expect(evidenciasDoDia({ detalhe: [det({ evidencia: 'vizinhanca' })], geo, paradasPorPlaca: new Map(), indep: new Map() })).toEqual([])
    expect(evidenciasDoDia({ detalhe: [det({})], geo: new Map([['1', { lat: -22.9, lng: -43.2, confiavel: false }]]), paradasPorPlaca: new Map(), indep: new Map() })).toEqual([])
  })
  it('NF não confirmada: parada única do caminhão perto do endereço achado por fora (e longe do nosso ponto) vira candidata', () => {
    const ev = evidenciasDoDia({
      detalhe: [det({ status: 'pendente', evidencia: 'sem_evidencia', distParadaM: null })],
      geo: new Map([['1', { lat: -22.95, lng: -43.25, confiavel: true }]]),
      paradasPorPlaca: new Map([['AAA1A11', { apagao: false, paradas: [parada(-22.9001, -43.2001, 16), parada(-23.1, -43.5, 30)] }]]),
      indep: new Map([['1', { lat: -22.9, lng: -43.2 }]]),
    })
    expect(ev).toEqual([expect.objectContaining({ chave: '100', origem: 'parada_orfa', lat: -22.9001, lng: -43.2001 })])
    expect(ev[0].distGeocodeM).toBeGreaterThan(5000)
  })
  it('sem candidata única, parada curta, apagão de sinal ou parada colada em outra entrega: nada', () => {
    const base = { detalhe: [det({ status: 'pendente', evidencia: 'sem_evidencia', distParadaM: null }), det({ nf: '2', clienteCodigo: '200' })],
      geo: new Map([['1', { lat: -22.95, lng: -43.25, confiavel: true }], ['2', { lat: -22.9003, lng: -43.2003, confiavel: true }]]), indep: new Map([['1', { lat: -22.9, lng: -43.2 }]]) }
    // parada colada na NF 2 (já entregue) não serve pra NF 1
    expect(evidenciasDoDia({ ...base, paradasPorPlaca: new Map([['AAA1A11', { apagao: false, paradas: [parada(-22.9001, -43.2001, 16)] }]]) }).filter(e => e.origem === 'parada_orfa')).toEqual([])
    const so1 = { ...base, detalhe: [base.detalhe[0]] }
    expect(evidenciasDoDia({ ...so1, paradasPorPlaca: new Map([['AAA1A11', { apagao: false, paradas: [parada(-22.9001, -43.2001, 5)] }]]) })).toEqual([])
    expect(evidenciasDoDia({ ...so1, paradasPorPlaca: new Map([['AAA1A11', { apagao: true, paradas: [parada(-22.9001, -43.2001, 16)] }]]) })).toEqual([])
    expect(evidenciasDoDia({ ...so1, paradasPorPlaca: new Map([['AAA1A11', { apagao: false, paradas: [parada(-22.9001, -43.2001, 16), parada(-22.9015, -43.2015, 20)] }]]) })).toEqual([])
  })
  it('pão (sem código de cliente de verdade) e carga sem placa ficam de fora', () => {
    const geo = new Map([['1', { lat: -22.9, lng: -43.2, confiavel: true }]])
    expect(evidenciasDoDia({ detalhe: [det({ carga: 'PAO-3', clienteCodigo: '1' })], geo, paradasPorPlaca: new Map(), indep: new Map() })).toEqual([])
  })
})

describe('escolherLocal', () => {
  const ev = (origem: 'entrega_confirmada' | 'parada_orfa' | 'manual', lat: number, lng: number) => ({ origem, lat, lng })
  it('manual manda; depois entrega confirmada (2+ dias que concordam); depois parada órfã (2+)', () => {
    expect(escolherLocal([ev('manual', -22.1, -43.1), ev('entrega_confirmada', -22.9, -43.2), ev('entrega_confirmada', -22.9, -43.2)])).toMatchObject({ fonte: 'manual', lat: -22.1 })
    expect(escolherLocal([ev('entrega_confirmada', -22.9, -43.2), ev('entrega_confirmada', -22.9001, -43.2001), ev('parada_orfa', -22.5, -43.5), ev('parada_orfa', -22.5, -43.5)])).toMatchObject({ fonte: 'entrega_confirmada', confirmacoes: 2 })
    expect(escolherLocal([ev('entrega_confirmada', -22.9, -43.2), ev('parada_orfa', -22.5, -43.5), ev('parada_orfa', -22.5001, -43.5001)])).toMatchObject({ fonte: 'parada_orfa', confirmacoes: 2 })
  })
  it('só uma evidência: guarda com 1 confirmação (ainda não é usada pelo KPI)', () => {
    expect(escolherLocal([ev('parada_orfa', -22.5, -43.5)])).toMatchObject({ fonte: 'parada_orfa', confirmacoes: 1 })
    expect(escolherLocal([])).toBeNull()
  })
})

// 09/10 (auditoria da geocodificacao): ~300 NFs/dia so' confirmam pelo cadastro da
// Unitrac porque o geocode do romaneio esta' errado; o cliente repete o erro todo dia.
describe('evidenciasDoDia -- entrega confirmada pelo cadastro da Unitrac', () => {
  const geo = new Map([['1', { lat: -22.9, lng: -43.2, confiavel: true }]])
  const M = 1 / 111_195
  const cadastro = (m: number) => new Map([['1', { lat: -22.9 + m * M, lng: -43.2 }]])
  const forte: Partial<LinhaDetalheEntrega> = { evidencia: 'parada_no_cadastro_unitrac', status: 'confirmado_unitrac', distParadaM: 40 }
  const run = (d: Partial<LinhaDetalheEntrega>, cad = cadastro(900)) => evidenciasDoDia({ detalhe: [det(d)], geo, paradasPorPlaca: new Map(), indep: new Map(), cadastro: cad })

  it('feito da Unitrac + parada no cadastro + geocode a 900 m: ensina o ponto do cadastro (origem que vale so\' no mesmo endereco)', () => {
    const ev = run(forte)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ chave: '100', origem: 'parada_orfa' })
    expect(ev[0].lat).toBeCloseTo(-22.9 + 900 * M, 6)
    expect(ev[0].distGeocodeM).toBeGreaterThan(850)
    expect(ev[0].detalhe).toMatch(/cadastro/)
  })
  it('sem feito (confirmado so\' pelo GPS): nao ensina', () => {
    expect(run({ ...forte, status: 'confirmado_gps' })).toEqual([])
  })
  it('parada a mais de 150 m do cadastro: nao ensina', () => {
    expect(run({ ...forte, distParadaM: 220 })).toEqual([])
  })
  it('geocode a menos de 300 m do cadastro (impreciso, nao errado) ou a mais de 3 km (suspeito demais): nao ensina', () => {
    expect(run(forte, cadastro(200))).toEqual([])
    expect(run(forte, cadastro(3500))).toEqual([])
  })
  it('sem cadastro da NF: nao ensina', () => {
    expect(run(forte, new Map())).toEqual([])
  })
})
