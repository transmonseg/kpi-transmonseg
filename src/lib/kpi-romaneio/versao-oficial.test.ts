import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => { throw new Error('sem banco no teste') } }))

import { organizarVersoes, exigeMotivoRegeracao, motivoValido, type GeracaoVersao } from './versao-oficial'
import type { FechamentoDia } from './fechamento-dashboard'

// F3-04 (ACH-10, D-26): 20/10 tem 4 gerações (100 -> 98,7 -> 96,5 -> 95,5),
// nenhuma marcada como oficial; 17/10 tem a geração das 20:41 com o romaneio
// de 16/10 (59,3%) no histórico. Números reais de kpi_romaneio_geracoes e
// kpi_ao_vivo_calculo (24/10).

const g = (id: string, data: string, geradoEm: string, taxa: number, entregues: number, nfsNaConta: number, aguardando: number, extra: Partial<GeracaoVersao['resumo'] & object> = {}): GeracaoVersao => ({
  id, data_referencia: data, gerado_em: geradoEm, gerado_por: 'transmonseg.25@gmail.com',
  resumo: { taxa, entregues, nfsNaConta, aguardando, ...extra },
})

const G20 = [
  g('5206db4d', '2026-10-20', '2026-10-20T14:02:26Z', 100, 1024, 1024, 1247),
  g('00c132b4', '2026-10-20', '2026-10-20T18:51:33Z', 98.7, 1928, 1954, 317),
  g('99f4a8d6', '2026-10-20', '2026-10-20T21:43:02Z', 96.5, 2105, 2181, 90),
  g('0a0db2a4', '2026-10-20', '2026-10-21T17:08:19Z', 95.5, 2161, 2263, 0),
]
const G17 = [
  g('5d405907', '2026-10-17', '2026-10-17T18:37:48Z', 98.7, 1848, 1873, 189),
  g('b7176129', '2026-10-17', '2026-10-17T23:41:33Z', 59.3, 1019, 1717, 424, {
    oculta: { motivo: 'gerado com o romaneio de 16/10 (D-26)', por: 'dono', em: '2026-10-24T12:00:00Z' },
  }),
]
const G16 = [g('35afa4cb', '2026-10-16', '2026-10-16T14:50:54Z', 99.2, 1413, 1424, 1207)]

const fech = (data: string, calculadoEm: string, taxa: number, entregues: number, nfsNaConta: number): FechamentoDia => ({ data, calculadoEm, resumo: { taxa, entregues, nfsNaConta, aguardando: 0 } })
const FECH = new Map<string, FechamentoDia>([
  ['2026-10-20', fech('2026-10-20', '2026-10-21T03:30:34Z', 95.5, 2161, 2263)],
  ['2026-10-17', fech('2026-10-17', '2026-10-18T03:30:25Z', 95.1, 1939, 2039)],
  ['2026-10-16', fech('2026-10-16', '2026-10-17T03:30:32Z', 94.5, 2454, 2596)],
])

describe('F3-04: versão oficial do dia no histórico', () => {
  const grupos = organizarVersoes([...G20, ...G17, ...G16].reverse(), FECH, new Map())
  const porData = new Map(grupos.map(x => [x.data, x]))

  it('dias em ordem do mais recente para o mais antigo', () => {
    expect(grupos.map(x => x.data)).toEqual(['2026-10-20', '2026-10-17', '2026-10-16'])
  })

  it('20/10: 1 oficial (95,5%, a geração igual ao fechamento) e 3 rascunhos com a diferença', () => {
    const d = porData.get('2026-10-20')!
    expect(d.oficial).toMatchObject({ tipo: 'fechamento', taxa: 95.5, geracaoId: '0a0db2a4' })
    expect(d.principal?.id).toBe('0a0db2a4')
    expect(d.rascunhos.map(r => [r.g.id, r.diferenca])).toEqual([['99f4a8d6', 1], ['00c132b4', 3.2], ['5206db4d', 4.5]])
    expect(d.escondidas).toBe(0)
  })

  it('17/10: a versão de 59,3% fica escondida (sem apagar); oficial = fechamento 95,1%', () => {
    const d = porData.get('2026-10-17')!
    expect(d.oficial).toMatchObject({ tipo: 'fechamento', taxa: 95.1, geracaoId: null })
    expect(d.principal).toBeNull()
    expect(d.rascunhos.map(r => [r.g.id, r.diferenca])).toEqual([['5d405907', 3.6]])
    expect(d.escondidas).toBe(1)
  })

  it('16/10: só a planilha parcial (99,2%) -> oficial é o fechamento 94,5% e ela vira rascunho', () => {
    const d = porData.get('2026-10-16')!
    expect(d.oficial).toMatchObject({ tipo: 'fechamento', taxa: 94.5, geracaoId: null })
    expect(d.rascunhos.map(r => [r.g.id, r.diferenca])).toEqual([['35afa4cb', 4.7]])
  })

  it('sem fechamento (antes do Ao vivo): oficial é a geração publicada no Dashboard', () => {
    const gs = [g('a', '2026-09-30', '2026-09-30T20:00:00Z', 96.0, 2000, 2083, 0), g('b', '2026-10-01', '2026-10-01T09:00:00Z', 97.6, 2044, 2094, 0), g('c', '2026-09-30', '2026-10-01T10:00:00Z', 96.4, 2008, 2083, 0)]
    const pub = new Map([['2026-09-30', { taxa: 96.0, entregues: 2000, nfsNaConta: 2083 }]])
    const d = organizarVersoes(gs, new Map(), pub).find(x => x.data === '2026-09-30')!
    expect(d.oficial).toMatchObject({ tipo: 'publicado', geracaoId: 'a' })
    expect(d.rascunhos.map(r => [r.g.id, r.diferenca])).toEqual([['c', 0.4]])
  })

  it('sem fechamento nem publicação: a mais recente fica em cima, sem selo de oficial', () => {
    const d = organizarVersoes([g('x', '2026-09-01', '2026-09-01T10:00:00Z', 97, 970, 1000, 0), g('y', '2026-09-01', '2026-09-01T20:00:00Z', 96, 960, 1000, 0)], new Map(), new Map())[0]
    expect(d.oficial).toBeNull()
    expect(d.principal?.id).toBe('y')
    expect(d.rascunhos.map(r => [r.g.id, r.diferenca])).toEqual([['x', 1]])
  })

  it('fechamento que não é fechamento (cálculo antes das 00:30) não vira oficial', () => {
    const f = new Map([['2026-10-20', { ...FECH.get('2026-10-20')!, calculadoEm: '2026-10-20T23:50:00Z' }]])
    expect(organizarVersoes(G20, f, new Map())[0].oficial).toBeNull()
  })
})

describe('F3-04: motivo obrigatório ao regerar um dia fechado', () => {
  it('20/10 (fechamento 95,5% às 00:30 de 21/10) gerado em 24/10: exige motivo', () => {
    expect(exigeMotivoRegeracao({ data: '2026-10-20', hoje: '2026-10-24', fechamento: FECH.get('2026-10-20')!, geracoes: [] })).toBe(true)
  })
  it('dia sem fechamento mas com geração completa: exige motivo', () => {
    expect(exigeMotivoRegeracao({ data: '2026-10-09', hoje: '2026-10-24', fechamento: null, geracoes: [g('z', '2026-10-09', '2026-10-10T13:00:00Z', 94.8, 2350, 2479, 0)] })).toBe(true)
  })
  it('dia de hoje, ou passado só com geração parcial e sem fechamento: não exige', () => {
    expect(exigeMotivoRegeracao({ data: '2026-10-24', hoje: '2026-10-24', fechamento: null, geracoes: G20 })).toBe(false)
    expect(exigeMotivoRegeracao({ data: '2026-10-16', hoje: '2026-10-24', fechamento: null, geracoes: G16 })).toBe(false)
  })
  it('a versão escondida não conta como dia fechado', () => {
    expect(exigeMotivoRegeracao({ data: '2026-10-17', hoje: '2026-10-24', fechamento: null, geracoes: [{ ...G17[1], resumo: { ...G17[1].resumo!, aguardando: 0 } }] })).toBe(false)
  })
  it('motivo de verdade: pelo menos 5 letras', () => {
    expect(motivoValido('  ')).toBeNull()
    expect(motivoValido('ok')).toBeNull()
    expect(motivoValido('  troca de placa RQU2G47 confirmada  ')).toBe('troca de placa RQU2G47 confirmada')
  })
})
