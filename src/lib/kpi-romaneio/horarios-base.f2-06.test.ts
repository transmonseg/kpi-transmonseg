import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { agregarPorCarga } from './agregacao'
import { gerarKpiRomaneioXlsx } from './gerador-xlsx'
import { extrairKpiCompleto } from './resumo-dashboard'
import { chegadaCdExibivel } from './types'
import type { LinhaGeocodificada, LinhaKpiRomaneio, Visita } from './types'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// F2-06 (KN-09, MON-13, plano mestre 23/10): horarios de base completos.
// Paradas reais do kpi_paradas_snapshot (nutrimax), horarios em Brasilia
// mascarado como UTC (mesma convencao do resto do KPI).
const parada = (placa: string, data: string, id: string, chegada: string, fim: string, lat: number, lng: number, classificacao = 'FORA_BASE'): UnitracParadaRow => ({
  id: `${placa}-${id}`, placa_norm: placa, chegada: `${data}T${chegada}.000Z`, fim_real: `${data}T${fim}.000Z`, saida: `${data}T${fim}.000Z`,
  duracao_seg: 0, local_parada: '', codigo_loja: null, nome_loja: null, lat, lng, classificacao, ordem: 0,
})
const rqv = (id: string, c: string, f: string, lat: number, lng: number, cl?: string) => parada('RQV9B26', '2026-10-22', id, c, f, lat, lng, cl)
const RQV9B26_22_10 = [
  rqv('api-1', '08:38:24', '09:22:24', -22.8239216, -43.2779583),
  rqv('api-2', '09:24:39', '09:32:39', -22.7027633, -43.280775),
  rqv('api-9', '12:18:54', '14:10:54', -22.6435966, -43.2902583),
  rqv('api-12', '14:37:23', '14:41:23', -22.6282766, -43.2090616),
  rqv('api-13', '14:45:45', '14:47:45', -22.6417983, -43.219495),
  rqv('api-14', '15:17:05', '19:58:31', -22.8157633, -43.27791, 'BASE'),
]
const rqs = (id: string, c: string, f: string, lat: number, lng: number, cl?: string) => parada('RQS7H76', '2026-10-14', id, c, f, lat, lng, cl)
const RQS7H76_14_10 = [
  rqs('api-1', '06:47:42', '08:53:42', -22.8150166, -43.2778916, 'BASE'),
  rqs('api-2', '09:00:51', '09:17:51', -22.789845, -43.2845366),
  rqs('api-24', '18:13:49', '18:20:49', -22.6401316, -43.2720066),
  rqs('api-25', '18:53:30', '23:49:34', -22.815845, -43.2779633, 'BASE'),
]
const linha = (nf: string, placa: string): LinhaGeocodificada => ({
  carga: '100678', destino: 'X', placa, motorista: 'M', ajudantes: [], nf, clienteCodigo: nf, clienteNome: 'C', endereco: 'E', lat: -22.7, lng: -43.28,
})
const visita = (nf: string, data: string, chegada: string, saida: string): [string, Visita] =>
  [nf, { nf, chegada: `${data}T${chegada}.000Z`, saida: `${data}T${saida}.000Z`, distanciaMetrosDoPonto: 50 }]

describe('F2-06 agregarPorCarga: horarios de base', () => {
  // RQV9B26 22/10: entregas de 09:20 (Churrasco do Ricardo) a 14:41 (Mercado da Monica).
  const visitasRqv = new Map([
    visita('2438539', '2026-10-22', '09:20:15', '09:22:37'),
    visita('2438526', '2026-10-22', '14:37:00', '14:41:00'),
  ])
  const linhasRqv = [linha('2438539', 'RQV9B26'), linha('2438526', 'RQV9B26')]

  it('RQV9B26 22/10: pernoite fora da cerca -> saida estimada (sem sinal ate 09:20) e a chegada da ponte (15:16) aparece', () => {
    const r = agregarPorCarga('100678', 'RQV9B26', linhasRqv, null, [], visitasRqv, RQV9B26_22_10, null,
      { saidaBase: null, chegadaBase: '2026-10-22T15:16:41.109Z', kmPercorrido: 73.9, saidaSemSinalAte: '2026-10-22T09:20:15.032Z' })
    expect(r.saidaCd).toBeNull()
    expect(r.saidaCdSemSinalAte).toBe('2026-10-22T09:20:15.032Z')
    expect(r.chegadaCd).toBe('2026-10-22T15:16:41.109Z')
    expect(chegadaCdExibivel(r)).toBe('2026-10-22T15:16:41.109Z')
    expect(r.tempoOperacaoMin).toBeNull()
  })

  it('RQV9B26 22/10 sem chegada da ponte: a parada BASE da Unitrac depois da ultima entrega (15:17) entra marcada', () => {
    const r = agregarPorCarga('100678', 'RQV9B26', linhasRqv, null, [], visitasRqv, RQV9B26_22_10, null,
      { saidaBase: null, chegadaBase: null, kmPercorrido: 73.9 })
    expect(r.chegadaCd).toBe('2026-10-22T15:17:05.000Z')
    expect(r.chegadaCdOrigem).toBe('unitrac')
    // Nenhuma parada BASE antes da 1a entrega (a api-1 e' FORA_BASE): saida continua vazia.
    expect(r.saidaCd).toBeNull()
  })

  it('RQS7H76 14/10 sem transicao na ponte: saida = fim da ultima BASE antes da 1a entrega, chegada = 1a BASE depois da ultima', () => {
    const visitas = new Map([visita('A', '2026-10-14', '09:00:51', '09:17:51'), visita('B', '2026-10-14', '18:13:49', '18:20:49')])
    const r = agregarPorCarga('1', 'RQS7H76', [linha('A', 'RQS7H76'), linha('B', 'RQS7H76')], null, [], visitas, RQS7H76_14_10, null,
      { saidaBase: null, chegadaBase: null, kmPercorrido: 120 })
    expect(r.saidaCd).toBe('2026-10-14T08:53:42.000Z')
    expect(r.saidaCdOrigem).toBe('unitrac')
    expect(r.chegadaCd).toBe('2026-10-14T18:53:30.000Z')
    expect(r.chegadaCdOrigem).toBe('unitrac')
    expect(r.tempoOperacaoMin).toBe(600)
  })

  it('ponte com saida e chegada: nada muda (sem origem, sem estimativa)', () => {
    const r = agregarPorCarga('1', 'RQS7H76', [linha('A', 'RQS7H76')], null, [], new Map([visita('A', '2026-10-14', '09:00:51', '09:17:51')]), RQS7H76_14_10, null,
      { saidaBase: '2026-10-14T08:50:00.000Z', chegadaBase: '2026-10-14T18:50:00.000Z', kmPercorrido: 120, saidaSemSinalAte: null })
    expect(r.saidaCd).toBe('2026-10-14T08:50:00.000Z')
    expect(r.saidaCdOrigem ?? null).toBeNull()
    expect(r.chegadaCdOrigem ?? null).toBeNull()
    expect(r.saidaCdSemSinalAte ?? null).toBeNull()
  })
})

describe('F2-06 planilha e Ao vivo: "(Unitrac)" e saida estimada', () => {
  const base: LinhaKpiRomaneio = {
    carga: 'C1', placa: 'RQS7H76', destino: 'X', motorista: 'Y', ajudante1: null, ajudante2: null, pesoKg: null,
    clientesPlanejados: null, nfPlanejado: null, paradasReais: 1, paradasForaBase: 0, kmPercorrido: null,
    saidaCd: null, chegadaCd: null, tempoOperacaoMin: null, tempoMedioParadaMin: null, status: 'OK', temRastreador: true,
  }
  async function celulas(l: LinhaKpiRomaneio) {
    const buf = await gerarKpiRomaneioXlsx([l], '2026-10-14', [], [], '2026-10-24')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const row = wb.worksheets[0].getRow(3)
    const lido = await extrairKpiCompleto(buf)
    return { saida: row.getCell(13).value, chegada: row.getCell(14).value, carga: lido.resumo.cargas[0] }
  }

  it('horario da Unitrac sai "08:53 (Unitrac)" e o Ao vivo le a hora', async () => {
    const c = await celulas({ ...base, saidaCd: '2026-10-14T08:53:42.000Z', saidaCdOrigem: 'unitrac', chegadaCd: '2026-10-14T18:53:30.000Z', chegadaCdOrigem: 'unitrac' })
    expect(c.saida).toBe('08:53 (Unitrac)')
    expect(c.chegada).toBe('18:53 (Unitrac)')
    expect(c.carga.saida).toBe('08:53')
    expect(c.carga.chegada).toBe('18:53')
  })

  it('saida estimada: "ESTIMADA (SEM SINAL ATÉ 09:20)" e a chegada aparece', async () => {
    const c = await celulas({ ...base, saidaCdSemSinalAte: '2026-10-22T09:20:15.032Z', chegadaCd: '2026-10-22T15:16:41.109Z' })
    expect(c.saida).toBe('ESTIMADA (SEM SINAL ATÉ 09:20)')
    expect(c.chegada).toBe('15:16')
    expect(c.carga.saida).toBeNull()
    expect(c.carga.chegada).toBe('15:16')
  })
})
