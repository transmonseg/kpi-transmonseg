import { describe, it, expect } from 'vitest'
import { agregarPor, chaveGrupo, fmtPct, pioresRecorrentes, type GrupoAgg } from './calculos'
import type { DiaKpi } from '@/lib/kpi-romaneio/dashboard-kpis'
import type { CargaResumo } from '@/lib/kpi-romaneio/resumo-dashboard'
import fx from './__fixtures__/dashboard-nutry-2026-10.json'

// F3-10 (ACH-08): o Dashboard agregava só por placa e guardava o último
// destino visto. Em outubro, DUQUE DE CAXIAS 2 rodou com 4 placas e fechou
// em 82,6% (303/367, sem os parciais de 16 e 17/10). Fixture real:
// kpi_dashboard_kpis da Nutry de 01 a 23/10/2026 (só os campos usados).

type Linha = [string, string, string, string, number, number, number, number]
const diasOutubro: DiaKpi[] = (fx.dias as { data: string; taxa: number | null; nfsNaConta: number | null; entregues: number | null; aguardando: number; cargas: Linha[] }[]).map(d => ({
  data: d.data, arquivoNome: null, inseridoPor: null, inseridoEm: '',
  resumo: {
    versao: 1, taxa: d.taxa, nfsNaConta: d.nfsNaConta, entregues: d.entregues, pendentes: 0, semRastreador: 0,
    aguardando: d.aguardando, foraDaConta: null, motivos: {},
    cargas: d.cargas.map(([carga, placa, destino, motorista, nfPlanejado, nfConfirmadas, nfForaDaConta, nfSemRastreador]): CargaResumo => ({
      carga, placa, destino, motorista, nfPlanejado, nfConfirmadas, nfForaDaConta, nfSemRastreador,
      km: null, saida: null, chegada: null, tempoOperacaoMin: null, tempoMedioMin: null,
    })),
  },
}))

const carga = (placa: string, destino: string, motorista: string, plan: number, conf: number, fora = 0): CargaResumo => ({
  carga: '1', placa, destino, motorista, nfPlanejado: plan, nfConfirmadas: conf, nfForaDaConta: fora,
  km: null, saida: null, chegada: null, tempoOperacaoMin: null, tempoMedioMin: null,
})
const dia = (data: string, cargas: CargaResumo[], aguardando = 0): DiaKpi => ({
  data, arquivoNome: null, inseridoPor: null, inseridoEm: '',
  resumo: { versao: 1, taxa: null, nfsNaConta: null, entregues: null, pendentes: 0, semRastreador: 0, foraDaConta: null, cargas, motivos: {}, aguardando },
})
const achar = (gs: GrupoAgg[], nome: string) => gs.find(g => g.chave === chaveGrupo(nome))!

describe('F3-10: Dashboard por rota e por motorista', () => {
  it('outubro por rota: DUQUE DE CAXIAS 2 em 82,6% com as 4 placas', () => {
    const rotas = agregarPor(diasOutubro, 'rota')
    const dq = achar(rotas, 'DUQUE DE CAXIAS 2')
    expect(dq.nome).toBe('DUQUE DE CAXIAS 2')
    expect(dq.nfConfirmadas).toBe(303)
    expect(dq.nfPlanejado - dq.nfForaDaConta).toBe(367)
    expect(fmtPct(dq.taxa)).toBe('82,6%')
    expect([...dq.placas].sort()).toEqual(['RQS7H76', 'RQV0E64', 'RQV9B26', 'TTM2G01'])
    expect(dq.dias).toBe(14) // 16 dias de rota, menos os parciais de 16 e 17/10
    // Por placa a mesma rota aparece espalhada: RQV9B26 guarda só o último destino.
    expect(dq.porDia.find(p => p.data === '2026-10-13')).toMatchObject({ placas: ['RQV0E64'], nfConfirmadas: 21, naConta: 22 })
  })

  it('a rota junta grafias que só mudam acento, caixa ou espaço (MACAÉ = MACAE; S.A. DE PADUA = S.A.DE PADUA)', () => {
    expect(chaveGrupo('MACAÉ')).toBe(chaveGrupo('MACAE'))
    expect(chaveGrupo('S.A. DE PADUA')).toBe(chaveGrupo('S.A.DE PADUA'))
    expect(chaveGrupo('São Gonçalo  2')).toBe(chaveGrupo('SAO GONCALO 2'))
    // Erro de digitação não é juntado (não adivinha): ANGRAS DOS REIS fica separado.
    expect(chaveGrupo('ANGRAS DOS REIS')).not.toBe(chaveGrupo('ANGRA DOS REIS'))
    const rotas = agregarPor(diasOutubro, 'rota')
    const macae = achar(rotas, 'MACAE')
    expect(macae.nome).toBe('MACAÉ') // a grafia mais usada nos dias completos (9 MACAÉ x 8 MACAE)
    expect(macae.cargas).toBe(17)
    expect(rotas.filter(g => g.chave === chaveGrupo('MACAÉ'))).toHaveLength(1)
  })

  it('tendência semanal (segunda a domingo) da rota', () => {
    const dq = achar(agregarPor(diasOutubro, 'rota'), 'DUQUE DE CAXIAS 2')
    expect(dq.semanas.map(s => s.semana)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'])
    // semana de 19/10: 20 + 24 + 19 = 63 de 22 + 35 + 23 = 80
    expect(dq.semanas.at(-1)).toMatchObject({ semana: '2026-10-19', nfConfirmadas: 63, naConta: 80 })
    expect(dq.semanas.at(-1)!.taxa).toBeCloseTo(78.75, 2)
  })

  it('piores rotas recorrentes: abaixo da meta em pelo menos 3 dos últimos 5 dias da rota', () => {
    const rotas = agregarPor(diasOutubro, 'rota')
    const piores = pioresRecorrentes(rotas, 97)
    const dq = piores.find(p => p.grupo.chave === chaveGrupo('DUQUE DE CAXIAS 2'))!
    expect(dq.abaixo).toBe(5)
    expect(dq.ultimos.map(u => u.data)).toEqual(['2026-10-14', '2026-10-15', '2026-10-20', '2026-10-21', '2026-10-22'])
    expect(piores[0].grupo.nome).toBe('DUQUE DE CAXIAS 2') // 5 de 5 e a menor taxa
    // ZONA NORTE 2 fecha o mês em 96,5%, mas ficou abaixo em 3 dos últimos 5 (15, 21 e 22/10)
    expect(piores.find(p => p.grupo.chave === chaveGrupo('ZONA NORTE 2'))?.abaixo).toBe(3)
    // SAQUAREMA: 100, 93,9, 93,1, 100, 96,3 -> 3 de 5 abaixo de 97 (entra); com meta 93, 0 (não entra)
    expect(pioresRecorrentes(rotas, 93).some(p => p.grupo.chave === chaveGrupo('SAQUAREMA'))).toBe(false)
    expect(piores.find(p => p.grupo.chave === chaveGrupo('SAQUAREMA'))?.abaixo).toBe(3)
  })

  it('recorrência: 2 de 5 não entra, 3 de 5 entra; dia sem NF na conta e dia parcial não contam', () => {
    const d = (data: string, conf: number, plan = 10, fora = 0, aguardando = 0) => dia(data, [carga('AAA1A11', 'ROTA X', 'JOSE', plan, conf, fora)], aguardando)
    const duas = agregarPor([d('2026-10-01', 5), d('2026-10-02', 10), d('2026-10-03', 5), d('2026-10-05', 10), d('2026-10-06', 10)], 'rota')
    expect(pioresRecorrentes(duas, 97)).toHaveLength(0)
    const tres = agregarPor([
      d('2026-09-30', 0), // fora da janela dos últimos 5
      d('2026-10-01', 5), d('2026-10-02', 10), d('2026-10-03', 5),
      d('2026-10-04', 0, 10, 10), // sem NF na conta: não é dia da janela
      d('2026-10-05', 1, 10, 0, 50), // parcial: fora
      d('2026-10-06', 10), d('2026-10-07', 9),
    ], 'rota')
    const [p] = pioresRecorrentes(tres, 97)
    expect(p.abaixo).toBe(3)
    expect(p.ultimos.map(u => u.data)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-06', '2026-10-07'])
  })

  it('por motorista: rotas e placas que ele rodou', () => {
    const mot = agregarPor(diasOutubro, 'motorista')
    const bruno = achar(mot, 'BRUNO SALLES FERREIRA')
    expect(bruno.placas).toContain('RQV9B26')
    expect(bruno.outros).toContain('DUQUE DE CAXIAS 2')
    const rotas = agregarPor(diasOutubro, 'rota')
    expect(achar(rotas, 'DUQUE DE CAXIAS 2').outros).toHaveLength(5) // 5 motoristas na rota
  })

  it('taxa do grupo ignora NFs fora da conta, como a da placa; carga sem motorista vira "Sem motorista"', () => {
    const gs = agregarPor([dia('2026-10-01', [carga('AAA1A11', 'ROTA X', '', 30, 10, 20), carga('BBB2B22', 'rota x', ' ', 14, 0, 14)])], 'motorista')
    expect(gs).toHaveLength(1)
    expect(gs[0]).toMatchObject({ nome: 'Sem motorista', nfConfirmadas: 10, taxa: 100 })
    const rota = agregarPor([dia('2026-10-01', [carga('BBB2B22', 'ROTA Y', 'M', 14, 0, 14)])], 'rota')[0]
    expect(rota.taxa).toBeNull()
  })
})
