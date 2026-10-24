import { describe, it, expect, vi } from 'vitest'
import type { ResumoGeracao } from './resumo-dashboard'
import type { DiaKpi } from './dashboard-kpis'

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => { throw new Error('sem banco no teste') } }))

import {
  instanteFechamento, ehFechamento, decidirFechamentoDashboard, ofertasFechamento,
  publicarFechamentoNoDashboard, avisoPlanilhaParcial, trocarPeloFechamento, INSERIDO_POR_FECHAMENTO,
  type FechamentoDia, type DepsPublicar, type DepsTrocar,
} from './fechamento-dashboard'

// F3-01 (ACH-01, D-26): o Dashboard da Nutry ficou com 16/10 em 99,2% (1.207
// aguardando, planilha das 11:50) e 17/10 em 98,7% (189 aguardando); o
// fechamento das 00:30 deu 94,5% e 95,1%. A RQ so' tem 02/10 no Dashboard,
// embora o Ao vivo feche a RQ todo dia. Numeros reais de kpi_dashboard_kpis e
// kpi_ao_vivo_calculo (24/10).

const resumo = (r: Partial<ResumoGeracao>): ResumoGeracao => ({
  versao: 1, taxa: null, nfsNaConta: null, entregues: null, pendentes: 0, semRastreador: 0,
  aguardando: 0, foraDaConta: null, cargas: [], motivos: {}, ...r,
})
const dia = (data: string, r: Partial<ResumoGeracao>, inseridoPor = 'ericanutrymax@gmail.com'): DiaKpi => ({
  data, resumo: resumo(r), arquivoNome: `KPI-Nutry-Max-${data}.xlsx`, inseridoPor, inseridoEm: '2026-10-18T01:15:51Z',
})

// Dashboard (inserido a mao) e fechamento (Ao vivo, 05:30 do dia seguinte).
const DASH_16 = dia('2026-10-16', { taxa: 99.2, entregues: 1413, nfsNaConta: 1424, aguardando: 1207 })
const DASH_17 = dia('2026-10-17', { taxa: 98.7, entregues: 1848, nfsNaConta: 1873, aguardando: 189 })
const DASH_06 = dia('2026-10-06', { taxa: 96.3, entregues: 2394, nfsNaConta: 2486 })
const DASH_22 = dia('2026-10-22', { taxa: 96.9, entregues: 2183, nfsNaConta: 2253 })
type Fech = FechamentoDia & { calculadoEm: string }
const FECH_16: Fech = { data: '2026-10-16', calculadoEm: '2026-10-17T03:30:32.278Z', resumo: { taxa: 94.5, entregues: 2454, nfsNaConta: 2596, aguardando: 0 } }
const FECH_17: Fech = { data: '2026-10-17', calculadoEm: '2026-10-18T03:30:25.193Z', resumo: { taxa: 95.1, entregues: 1939, nfsNaConta: 2039, aguardando: 0 } }
const FECH_06: Fech = { data: '2026-10-06', calculadoEm: '2026-10-07T03:31:11.838Z', resumo: { taxa: 96.6, entregues: 2401, nfsNaConta: 2486, aguardando: 0 } }
const FECH_22: Fech = { data: '2026-10-22', calculadoEm: '2026-10-23T03:30:24.421Z', resumo: { taxa: 96.9, entregues: 2183, nfsNaConta: 2253, aguardando: 0 } }
const FECH_RQ_22: Fech = { data: '2026-10-22', calculadoEm: '2026-10-23T03:31:15.332Z', resumo: { taxa: 91.4, entregues: 2633, nfsNaConta: 2881, aguardando: 0 } }

describe('F3-01: o que conta como fechamento', () => {
  it('fechamento = calculo a partir das 00:30 BRT do dia seguinte', () => {
    expect(new Date(instanteFechamento('2026-10-16')).toISOString()).toBe('2026-10-17T03:30:00.000Z')
    expect(ehFechamento('2026-10-17T03:30:32.278Z', '2026-10-16')).toBe(true)
    // ultimo calculo do dia ainda com a rota rodando (20:50 BRT): nao e' fechamento
    expect(ehFechamento('2026-10-16T23:50:00Z', '2026-10-16')).toBe(false)
    // 00:10 do dia seguinte: antes do fechamento
    expect(ehFechamento('2026-10-17T03:10:00Z', '2026-10-16')).toBe(false)
    expect(ehFechamento(null, '2026-10-16')).toBe(false)
  })
})

describe('F3-01: decidir se o fechamento grava no Dashboard', () => {
  const semLeitor = { leitorExterno: false }
  it('dia ausente (RQ 22/10): grava', () => {
    expect(decidirFechamentoDashboard(null, FECH_RQ_22.resumo, semLeitor)).toEqual({ acao: 'gravar', motivo: 'ausente' })
  })
  it('dia parcial (16/10 com 1.207 aguardando, 99,2%): grava o fechamento de 94,5%', () => {
    expect(decidirFechamentoDashboard(DASH_16, FECH_16.resumo, semLeitor)).toEqual({ acao: 'gravar', motivo: 'parcial' })
    expect(decidirFechamentoDashboard(DASH_17, FECH_17.resumo, semLeitor)).toEqual({ acao: 'gravar', motivo: 'parcial' })
  })
  it('dia completo inserido a mao e diferente (06/10: 96,3% x 96,6%): NAO sobrescreve, vira oferta', () => {
    expect(decidirFechamentoDashboard(DASH_06, FECH_06.resumo, semLeitor)).toEqual({ acao: 'oferta', motivo: 'manual_diferente' })
  })
  it('dia completo igual ao fechamento (22/10: 96,9%, 2.183/2.253): nada a fazer', () => {
    expect(decidirFechamentoDashboard(DASH_22, FECH_22.resumo, semLeitor)).toEqual({ acao: 'igual', motivo: 'igual' })
  })
  it('dia gravado por um fechamento anterior (reconferencia das 05:30, recalculo): atualiza', () => {
    const anterior = dia('2026-10-23', { taxa: 93.4, entregues: 2170, nfsNaConta: 2324, origem: 'fechamento' }, INSERIDO_POR_FECHAMENTO)
    expect(decidirFechamentoDashboard(anterior, { taxa: 93.7, entregues: 2177, nfsNaConta: 2324, aguardando: 0 }, semLeitor))
      .toEqual({ acao: 'gravar', motivo: 'fechamento_anterior' })
  })
  it('com login de cliente lendo o Dashboard: nunca grava sozinho, volta a exigir o clique', () => {
    expect(decidirFechamentoDashboard(null, FECH_RQ_22.resumo, { leitorExterno: true })).toEqual({ acao: 'oferta', motivo: 'leitor_externo' })
    expect(decidirFechamentoDashboard(DASH_16, FECH_16.resumo, { leitorExterno: true })).toEqual({ acao: 'oferta', motivo: 'leitor_externo' })
    expect(decidirFechamentoDashboard(DASH_22, FECH_22.resumo, { leitorExterno: true })).toEqual({ acao: 'igual', motivo: 'igual' })
  })
})

describe('F3-01: "Fechamento disponível: X% — trocar" no Dashboard', () => {
  it('lista os dias com fechamento diferente do Dashboard, ausentes ou parciais; nunca os iguais', () => {
    const ofertas = ofertasFechamento([DASH_06, DASH_16, DASH_17, DASH_22], [FECH_06, FECH_16, FECH_17, FECH_22, { ...FECH_RQ_22, data: '2026-10-21' }])
    expect(ofertas.map(o => [o.data, o.taxa, o.atual?.taxa ?? null, o.atual?.parcial ?? null])).toEqual([
      ['2026-10-06', 96.6, 96.3, false],
      ['2026-10-16', 94.5, 99.2, true],
      ['2026-10-17', 95.1, 98.7, true],
      ['2026-10-21', 91.4, null, null],
    ])
  })
  it('calculo que nao e fechamento, degradado ou ainda com NF aguardando nao vira oferta', () => {
    const naoFechou = { ...FECH_16, calculadoEm: '2026-10-16T23:50:00Z' }
    const degradado = { ...FECH_17, degradado: 'ponte de coerência do monitoramento falhou em 200 rua(s)' }
    const aguardando = { ...FECH_06, resumo: { ...FECH_06.resumo, aguardando: 12 } }
    expect(ofertasFechamento([], [naoFechou, degradado, aguardando])).toEqual([])
  })
})

describe('F3-01: planilha parcial gera aviso e oferta, sem recusar', () => {
  it('16/10 com 1.207 aguardando: aviso + oferta do fechamento de 94,5%', () => {
    expect(avisoPlanilhaParcial(DASH_16.resumo, FECH_16)).toEqual({ aguardando: 1207, ofertaFechamento: { taxa: 94.5, entregues: 2454, nfsNaConta: 2596 } })
  })
  it('parcial sem fechamento (dia de hoje): so o aviso', () => {
    expect(avisoPlanilhaParcial(DASH_16.resumo, null)).toEqual({ aguardando: 1207, ofertaFechamento: null })
  })
  it('planilha completa: sem aviso', () => {
    expect(avisoPlanilhaParcial(DASH_22.resumo, FECH_22)).toBeNull()
  })
})

function depsPublicar(existente: DiaKpi | null, leitorExterno: boolean | Error = false) {
  const gravados: Parameters<DepsPublicar['gravar']>[0][] = []
  const logs: string[] = []
  const deps: DepsPublicar = {
    lerDia: async () => existente,
    temLeitorExterno: async () => { if (leitorExterno instanceof Error) throw leitorExterno; return leitorExterno },
    gravar: async r => { gravados.push(r) },
  }
  return { deps, gravados, logs, log: (m: string) => logs.push(m) }
}

const LIDO_16 = { resumo: resumo({ taxa: 94.5, entregues: 2454, nfsNaConta: 2596, aguardando: 0 }), nfs: [] }

describe('F3-01: o fechamento das 00:30 grava no Dashboard', () => {
  it('16/10 parcial no Dashboard: grava 94,5% marcado como fechamento', async () => {
    const t = depsPublicar(DASH_16)
    const r = await publicarFechamentoNoDashboard({ cliente: 'nutrimax', data: '2026-10-16', xlsx: Buffer.from('x'), lido: LIDO_16, calculadoEm: FECH_16.calculadoEm, log: t.log }, t.deps)
    expect(r).toEqual({ acao: 'gravar', motivo: 'parcial' })
    expect(t.gravados).toHaveLength(1)
    expect(t.gravados[0]).toMatchObject({ cliente: 'nutrimax', data: '2026-10-16', inseridoPor: INSERIDO_POR_FECHAMENTO })
    expect(t.gravados[0].resumo).toMatchObject({ taxa: 94.5, origem: 'fechamento', fechamentoEm: FECH_16.calculadoEm })
    expect(t.logs.join('\n')).toContain('94,5%')
  })
  it('RQ ausente no Dashboard: grava', async () => {
    const t = depsPublicar(null)
    const lido = { resumo: resumo({ taxa: 91.4, entregues: 2633, nfsNaConta: 2881 }), nfs: [] }
    expect(await publicarFechamentoNoDashboard({ cliente: 'rioquality', data: '2026-10-22', xlsx: Buffer.from('x'), lido, calculadoEm: FECH_RQ_22.calculadoEm, log: t.log }, t.deps))
      .toEqual({ acao: 'gravar', motivo: 'ausente' })
    expect(t.gravados[0]).toMatchObject({ cliente: 'rioquality', data: '2026-10-22' })
  })
  it('dia completo manual diferente: nao grava (so registra a oferta no log)', async () => {
    const t = depsPublicar(DASH_06)
    const lido = { resumo: resumo({ taxa: 96.6, entregues: 2401, nfsNaConta: 2486 }), nfs: [] }
    expect(await publicarFechamentoNoDashboard({ cliente: 'nutrimax', data: '2026-10-06', xlsx: Buffer.from('x'), lido, calculadoEm: FECH_06.calculadoEm, log: t.log }, t.deps))
      .toEqual({ acao: 'oferta', motivo: 'manual_diferente' })
    expect(t.gravados).toEqual([])
    expect(t.logs.join('\n')).toContain('Fechamento disponível: 96,6%')
  })
  it('calculo do dia ainda aberto (antes das 00:30): nao mexe no Dashboard', async () => {
    const t = depsPublicar(null)
    expect(await publicarFechamentoNoDashboard({ cliente: 'nutrimax', data: '2026-10-16', xlsx: Buffer.from('x'), lido: LIDO_16, calculadoEm: '2026-10-16T23:50:00Z', log: t.log }, t.deps)).toBeNull()
    expect(t.gravados).toEqual([])
  })
  it('fechamento ainda com NF aguardando: nao grava', async () => {
    const t = depsPublicar(null)
    const lido = { resumo: resumo({ taxa: 99.2, entregues: 1413, nfsNaConta: 1424, aguardando: 1207 }), nfs: [] }
    expect(await publicarFechamentoNoDashboard({ cliente: 'nutrimax', data: '2026-10-16', xlsx: Buffer.from('x'), lido, calculadoEm: FECH_16.calculadoEm, log: t.log }, t.deps)).toBeNull()
    expect(t.gravados).toEqual([])
  })
  it('falha ao ler os logins: trata como se houvesse login de cliente (nao grava sozinho)', async () => {
    const t = depsPublicar(null, new Error('perfis fora'))
    expect(await publicarFechamentoNoDashboard({ cliente: 'nutrimax', data: '2026-10-16', xlsx: Buffer.from('x'), lido: LIDO_16, calculadoEm: FECH_16.calculadoEm, log: t.log }, t.deps))
      .toEqual({ acao: 'oferta', motivo: 'leitor_externo' })
    expect(t.gravados).toEqual([])
  })
})

describe('F3-01: botão "trocar" (decisão humana)', () => {
  const lidoXlsx = { data: '2026-10-16', ...LIDO_16 }
  const deps = (over: Partial<DepsTrocar> = {}) => {
    const gravados: Parameters<DepsTrocar['gravar']>[0][] = []
    const d: DepsTrocar = {
      lerFechamento: async () => FECH_16,
      baixarXlsx: async () => Buffer.from('planilha-fechamento'),
      ler: async () => lidoXlsx,
      gravar: async r => { gravados.push(r) },
      ...over,
    }
    return { d, gravados }
  }
  it('troca 16/10 pelo fechamento: grava 94,5% em nome de quem clicou', async () => {
    const t = deps()
    const r = await trocarPeloFechamento('nutrimax', '2026-10-16', 'ericanutrymax@gmail.com', t.d)
    expect(r).toMatchObject({ ok: true, data: '2026-10-16', taxa: 94.5 })
    expect(t.gravados[0]).toMatchObject({ inseridoPor: 'ericanutrymax@gmail.com' })
    expect(t.gravados[0].resumo).toMatchObject({ origem: 'fechamento', taxa: 94.5 })
  })
  it('sem fechamento valido: recusa com mensagem clara', async () => {
    const t = deps({ lerFechamento: async () => ({ ...FECH_16, calculadoEm: '2026-10-16T23:50:00Z' }) })
    const r = await trocarPeloFechamento('nutrimax', '2026-10-16', 'x', t.d)
    expect(r.ok).toBe(false)
    expect(t.gravados).toEqual([])
  })
  it('planilha guardada que nao bate com o fechamento: recusa (nao troca por numero errado)', async () => {
    const t = deps({ ler: async () => ({ ...lidoXlsx, resumo: resumo({ taxa: 99.2, entregues: 1413, nfsNaConta: 1424 }) }) })
    const r = await trocarPeloFechamento('nutrimax', '2026-10-16', 'x', t.d)
    expect(r.ok).toBe(false)
    expect(t.gravados).toEqual([])
  })
})
