import { describe, it, expect } from 'vitest'
import { intervalo, intervaloAnterior, agregar } from './calculos'
import type { DiaKpi } from '@/lib/kpi-romaneio/dashboard-kpis'
import type { ResumoGeracao } from '@/lib/kpi-romaneio/resumo-dashboard'

const carga = (placa: string, plan: number, conf: number, km: number, op: number, pe: number) => ({
  carga: '1', placa, destino: 'X', motorista: 'M', nfPlanejado: plan, nfConfirmadas: conf, km, saida: '07:00', chegada: '17:00', tempoOperacaoMin: op, tempoMedioMin: pe,
})
const dia = (data: string, r: Partial<ResumoGeracao>): DiaKpi => ({
  data, arquivoNome: null, inseridoPor: null, inseridoEm: '',
  resumo: { versao: 1, taxa: null, nfsNaConta: null, entregues: null, pendentes: 0, semRastreador: 0, foraDaConta: null, cargas: [], motivos: {}, ...r },
})

describe('dashboard por cliente: calculos', () => {
  it('intervalos de dia, semana (segunda a domingo), mes e ano', () => {
    expect(intervalo('dia', '2026-10-02', '', '')).toEqual(['2026-10-02', '2026-10-02'])
    expect(intervalo('semana', '2026-10-02', '', '')).toEqual(['2026-09-28', '2026-10-04'])
    expect(intervalo('mes', '2026-09-15', '', '')).toEqual(['2026-09-01', '2026-09-30'])
    expect(intervalo('ano', '2026-09-15', '', '')).toEqual(['2026-01-01', '2026-12-31'])
    expect(intervaloAnterior(['2026-09-28', '2026-10-04'])).toEqual(['2026-09-21', '2026-09-27'])
  })

  it('taxa ponderada pelas NFs e dia parcial fora dos totais', () => {
    const a = agregar([
      dia('2026-10-01', { taxa: 90, entregues: 90, nfsNaConta: 100, pendentes: 10, cargas: [carga('AAA', 50, 45, 100, 600, 20)], motivos: { 'Não foi ao cliente': 10 } }),
      dia('2026-10-02', { taxa: 100, entregues: 300, nfsNaConta: 300, cargas: [carga('AAA', 60, 60, 200, 500, 10)] }),
      dia('2026-10-03', { taxa: 50, entregues: 5, nfsNaConta: 10, aguardando: 900, cargas: [carga('AAA', 10, 5, 50, 0, 0)] }),
    ])
    expect(a.taxa).toBe(97.5) // 390/400, sem o parcial
    expect(a.diasParciais).toBe(1)
    expect(a.km).toBe(300)
    expect(a.serie).toHaveLength(3)
    expect(a.placas[0]).toMatchObject({ placa: 'AAA', dias: 2, nfPlanejado: 110, nfConfirmadas: 105, operacaoMedia: 550, porEntregaMedia: 15 })
    expect(a.motivos).toEqual({ 'Não foi ao cliente': 10 })
  })

  it('placa com NFs fora da conta (sem rastreador / troca) nao derruba a taxa da placa', () => {
    const a = agregar([
      dia('2026-10-03', { taxa: 100, entregues: 10, nfsNaConta: 10, cargas: [
        { ...carga('TTL5J17', 14, 0, 15, 0, 0), nfForaDaConta: 14 },
        { ...carga('RBG4F53', 30, 10, 100, 500, 15), carga: '2', nfForaDaConta: 20 },
      ] }),
    ])
    const ttl = a.placas.find(p => p.placa === 'TTL5J17')!
    const rbg = a.placas.find(p => p.placa === 'RBG4F53')!
    expect(ttl.taxa).toBeNull()
    expect(rbg.taxa).toBe(100) // 10 de 10 na conta
  })

  it('carga sem NF confirmada nao entra no tempo por entrega', () => {
    const a = agregar([dia('2026-10-01', { cargas: [carga('AAA', 10, 0, 15, 0, 564), carga('BBB', 10, 10, 100, 500, 20)] })])
    expect(a.porEntregaMedia).toBe(20)
    expect(a.placas.find(p => p.placa === 'AAA')?.porEntregaMedia).toBeNull()
  })
})
