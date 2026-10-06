import { describe, it, expect } from 'vitest'
import { resumirPlacas, paradaEmAndamento, nfProxima, horaParaIso, paradaDaChegada, diaAnterior, precisaFecharDia } from './ao-vivo'
import type { NfResumo, CargaResumo } from './resumo-dashboard'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

const nf = (o: Partial<NfResumo>): NfResumo => ({ placa: 'AAA1A11', carga: '1', nf: '10', cliente: 'C', endereco: 'E', chegada: null, saida: null, tempoMin: null, status: 'ENTREGUE', categoria: null, ...o })
const carga = (o: Partial<CargaResumo>): CargaResumo => ({ carga: '1', placa: 'AAA1A11', destino: 'Macaé', motorista: 'José', nfPlanejado: 3, nfConfirmadas: 2, km: 120.5, saida: '06:30', chegada: null, tempoOperacaoMin: null, tempoMedioMin: null, ...o })
const parada = (o: Partial<UnitracParadaRow>): UnitracParadaRow => ({ id: 'p', placa_norm: 'AAA1A11', chegada: '2026-10-06T10:00:00Z', saida: null, duracao_seg: 600, local_parada: '', codigo_loja: null, nome_loja: null, classificacao: 'FORA_BASE', lat: -22.9, lng: -43.2, ...o } as UnitracParadaRow)

describe('horaParaIso', () => {
  it('HH:MM do dia em BRT vira instante', () => {
    expect(horaParaIso('2026-10-06', '06:30')).toBe('2026-10-06T06:30:00-03:00')
    expect(horaParaIso('2026-10-06', null)).toBeNull()
    expect(horaParaIso('2026-10-06', 'SEM RASTREADOR')).toBeNull()
  })
})

describe('resumirPlacas', () => {
  it('feitas = entregues + sem rastreador; % sobre o total; saída da base em ISO', () => {
    const nfs = [
      nf({ nf: '1' }),
      nf({ nf: '2', status: 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO', categoria: 'Sem rastreador' }),
      nf({ nf: '3', status: 'PENDENTE', categoria: 'Sem confirmação' }),
      nf({ nf: '4', status: 'ENTREGUE - PARADA NA MESMA RUA', categoria: null }),
    ]
    const [p] = resumirPlacas('2026-10-06', nfs, [carga({ nfPlanejado: 4 })], new Map([['1', { lat: -22.9, lng: -43.2 }]]))
    expect(p).toMatchObject({ placa: 'AAA1A11', motorista: 'José', destino: 'Macaé', total: 4, feitas: 3, pct: 75, saidaBase: '2026-10-06T06:30:00-03:00', km: 120.5 })
    expect(p.nfs[0]).toMatchObject({ nf: '1', lat: -22.9, lng: -43.2, situacao: 'entregue' })
    expect(p.nfs.map(n => n.situacao)).toEqual(['entregue', 'sem_rastreador', 'nao_confirmada', 'entregue'])
  })
  it('ordena placas por % crescente (quem precisa de atenção primeiro) e depois placa', () => {
    const r = resumirPlacas('2026-10-06', [nf({ placa: 'BBB', nf: '1' }), nf({ placa: 'AAA', nf: '2', status: 'PENDENTE', categoria: 'Sem confirmação' })], [carga({ placa: 'BBB' }), carga({ placa: 'AAA' })], new Map())
    expect(r.map(p => p.placa)).toEqual(['AAA', 'BBB'])
  })
  it('categorias viram situações simples pro cliente', () => {
    const r = resumirPlacas('2026-10-06', [
      nf({ nf: '1', status: 'NÃO FOI AO CLIENTE', categoria: 'Não foi ao cliente' }),
      nf({ nf: '2', status: 'AGUARDANDO - ROTA EM ANDAMENTO', categoria: 'Aguardando fim da rota' }),
      nf({ nf: '3', status: 'COORDENADA APROXIMADA', categoria: 'Coordenada imprecisa' }),
      nf({ nf: '4', status: 'SEM CONFIRMAÇÃO', categoria: 'Sem confirmação' }),
    ], [carga({})], new Map())
    // "Sem confirmação" = a rota acabou e a NF não foi confirmada: não é
    // pendente (pedido 05/10: "como tá pendente se acabou o dia").
    expect(r[0].nfs.map(n => n.situacao)).toEqual(['nao_foi', 'pendente', 'revisar', 'nao_confirmada'])
  })
})

describe('paradaEmAndamento', () => {
  // Horário da Unitrac vem em Brasília MASCARADO como UTC (consolida.ts):
  // "10:07Z" é 10:07 de Brasília = 13:07Z de verdade. Achado 06/10: a
  // comparação com o relógio real dava 3 h de diferença e nunca disparava.
  const agora = Date.parse('2026-10-06T13:30:00Z') // 10:30 em Brasília
  it('última parada fora da base que ainda não terminou (fim há < 5 min); início devolvido em UTC real', () => {
    const p = paradaEmAndamento([parada({ chegada: '2026-10-06T09:00:00Z', fim_real: '2026-10-06T09:20:00Z' }), parada({ chegada: '2026-10-06T10:07:00Z', fim_real: '2026-10-06T10:28:00Z' })], agora)
    expect(p).toMatchObject({ inicio: '2026-10-06T13:07:00.000Z' })
  })
  it('última parada já terminou há mais de 5 min: em trânsito (null)', () => {
    expect(paradaEmAndamento([parada({ chegada: '2026-10-06T09:00:00Z', fim_real: '2026-10-06T10:10:00Z' })], agora)).toBeNull()
  })
  it('parada na base não conta como cliente', () => {
    expect(paradaEmAndamento([parada({ chegada: '2026-10-06T10:07:00Z', fim_real: '2026-10-06T10:29:00Z', classificacao: 'BASE' })], agora)).toBeNull()
  })
})

describe('nfProxima', () => {
  const nfs = [
    { nf: '1', situacao: 'entregue' as const, lat: -22.9000, lng: -43.2000 },
    { nf: '2', situacao: 'pendente' as const, lat: -22.9003, lng: -43.2003 },
    { nf: '3', situacao: 'pendente' as const, lat: -22.9500, lng: -43.2500 },
  ]
  it('NF pendente mais perto dentro de 800 m (mesma régua ampliada do KPI)', () => {
    expect(nfProxima(nfs, { lat: -22.9001, lng: -43.2001 })?.nf).toBe('2')
  })
  it('nenhuma dentro de 800 m: null', () => {
    expect(nfProxima(nfs, { lat: -23.5, lng: -43.9 })).toBeNull()
  })
})

describe('paradaDaChegada (ponto da parada que o KPI contou como entrega)', () => {
  const ps = [
    parada({ chegada: '2026-10-05T09:15:00Z', fim_real: '2026-10-05T09:41:00Z', lat: -22.92, lng: -43.23 }),
    parada({ chegada: '2026-10-05T10:08:00Z', fim_real: '2026-10-05T10:58:00Z', lat: -22.918, lng: -43.212 }),
  ]
  it('a parada em que a chegada da NF cai dentro', () => {
    expect(paradaDaChegada(ps, '2026-10-05T10:13:00Z')).toEqual({ lat: -22.918, lng: -43.212 })
  })
  it('chegada na virada entre duas paradas: a que começa nela, não a que termina nela', () => {
    const v = [
      parada({ chegada: '2026-10-05T08:20:00Z', fim_real: '2026-10-05T08:34:00Z', lat: -22.30, lng: -42.55 }),
      parada({ chegada: '2026-10-05T08:34:00Z', fim_real: '2026-10-05T10:29:00Z', lat: -22.27, lng: -42.53 }),
    ]
    expect(paradaDaChegada(v, '2026-10-05T08:34:00Z')).toEqual({ lat: -22.27, lng: -42.53 })
  })
  it('chegada fora de qualquer parada: a que começa mais perto, até 5 min', () => {
    expect(paradaDaChegada(ps, '2026-10-05T10:05:00Z')).toEqual({ lat: -22.918, lng: -43.212 })
    expect(paradaDaChegada(ps, '2026-10-05T12:00:00Z')).toBeNull()
    expect(paradaDaChegada(ps, null)).toBeNull()
  })
})

describe('fechamento do dia (último cálculo depois que o dia acabou)', () => {
  it('dia anterior', () => {
    expect(diaAnterior('2026-10-06')).toBe('2026-10-05')
    expect(diaAnterior('2026-11-01')).toBe('2026-10-31')
  })
  it('recalcula só se o último cálculo foi antes de 00:30 do dia seguinte e já passou disso', () => {
    const agora = Date.parse('2026-10-06T00:40:00-03:00')
    expect(precisaFecharDia('2026-10-05T23:39:00-03:00', '2026-10-05', agora)).toBe(true)
    expect(precisaFecharDia('2026-10-06T00:35:00-03:00', '2026-10-05', agora)).toBe(false)
    expect(precisaFecharDia('2026-10-05T23:39:00-03:00', '2026-10-05', Date.parse('2026-10-06T00:10:00-03:00'))).toBe(false)
    expect(precisaFecharDia(null, '2026-10-05', agora)).toBe(false)
  })
})
