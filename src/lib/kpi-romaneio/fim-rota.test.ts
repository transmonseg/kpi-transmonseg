import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Visita } from './types'
import type { AlvoApi } from '@/lib/unitrac-api'
import type { HorarioBase, ParadaBridge } from './base-horarios'

const buscarHorariosBaseMock = vi.hoisted(() => vi.fn())
vi.mock('./base-horarios', async importOriginal => {
  const real = await importOriginal<typeof import('./base-horarios')>()
  return { ...real, buscarHorariosBase: buscarHorariosBaseMock }
})

const { fimDaRota, precisaAjustarChegada, ajustarChegadaAposUltimaEntrega } = await import('./fim-rota')

const visita = (saida: string): Visita => ({ nf: 'x', chegada: saida, saida, distanciaMetrosDoPonto: 10 } as Visita)
const alvo = (o: Partial<AlvoApi>): AlvoApi => ({ placaNorm: 'RBG5G18', codigoUnitrac: '1', nome: 'L', situacao: 1, feitoISO: '2026-09-21T13:50:00', documento: '1', inicioISO: null, ordem: 1, rota: 'r', pontoLat: null, pontoLng: null, ...o })
const base = (chegada: string, saida: string): ParadaBridge => ({ chegada, saida, duracaoSeg: 600, lat: -22.81, lng: -43.27, classificacao: 'BASE' })

describe('fimDaRota', () => {
  it('maior entre saida da visita e feitoISO confirmado (mesma convencao mascarada)', () => {
    expect(fimDaRota([visita('2026-09-21T13:59:00.000Z')], [alvo({})])).toBe('2026-09-21T13:59:00.000Z')
    expect(fimDaRota([visita('2026-09-21T10:00:00.000Z')], [alvo({ feitoISO: '2026-09-21T14:10:00' })])).toBe('2026-09-21T14:10:00.000Z')
  })
  it('ignora alvo nao feito e devolve null sem nada', () => {
    expect(fimDaRota([], [alvo({ situacao: 0 })])).toBeNull()
  })
})

describe('precisaAjustarChegada', () => {
  const paradas = [base('2026-09-21T15:02:00.000Z', '2026-09-21T16:07:00.000Z'), base('2026-09-21T19:34:00.000Z', '2026-09-21T22:04:00.000Z')]
  it('RBG5G18: volta 15:02 depois do fim 13:59, chegada atual 19:34 -> ajusta', () => {
    expect(precisaAjustarChegada(paradas, '2026-09-21T13:59:00.000Z', '2026-09-21T19:34:00.000Z')).toBe(true)
  })
  it('2a viagem: fim 18:00 (entregou depois de voltar) -> nao ajusta', () => {
    expect(precisaAjustarChegada(paradas, '2026-09-21T18:00:00.000Z', '2026-09-21T19:34:00.000Z')).toBe(false)
  })
  it('folga de ate 30 min -> nao ajusta', () => {
    expect(precisaAjustarChegada([base('2026-09-21T19:10:00.000Z', '2026-09-21T19:20:00.000Z')], '2026-09-21T13:59:00.000Z', '2026-09-21T19:34:00.000Z')).toBe(false)
  })
  it('fim null ou chegadaBase null -> nao ajusta', () => {
    expect(precisaAjustarChegada(paradas, null, '2026-09-21T19:34:00.000Z')).toBe(false)
    expect(precisaAjustarChegada(paradas, '2026-09-21T13:59:00.000Z', null)).toBe(false)
  })
})

describe('ajustarChegadaAposUltimaEntrega', () => {
  const horario = (o: Partial<HorarioBase>): HorarioBase => ({ saidaBase: null, chegadaBase: null, kmPercorrido: null, ...o })
  const paradasBase = [base('2026-09-21T15:02:00.000Z', '2026-09-21T16:07:00.000Z'), base('2026-09-21T19:34:00.000Z', '2026-09-21T22:04:00.000Z')]
  const nfsUmaNf = new Map([['RBG5G18', ['NF1']]])

  beforeEach(() => {
    buscarHorariosBaseMock.mockReset()
  })

  it('placa com volta extra e NF confirmada (via visita): chama buscarHorariosBase com fimRotaPorPlaca e atualiza chegada/km, mantendo saida da 1a chamada', async () => {
    const horarioBasePorPlaca = new Map([
      ['RBG5G18', horario({ saidaBase: '2026-09-21T08:00:00.000Z', chegadaBase: '2026-09-21T19:34:00.000Z', kmPercorrido: 120, paradas: paradasBase })],
    ])
    const visitasPorPlaca = new Map([['RBG5G18', new Map<string, Visita>([['NF1', visita('2026-09-21T13:59:00.000Z')]])]])
    const alvosPorPlaca = new Map<string, AlvoApi[]>([['RBG5G18', []]])
    // saidaBase da 2a chamada e' diferente de proposito -- deve ser ignorada.
    buscarHorariosBaseMock.mockResolvedValue(new Map([
      ['RBG5G18', horario({ saidaBase: '2026-09-21T09:00:00.000Z', chegadaBase: '2026-09-21T15:02:00.000Z', kmPercorrido: 80 })],
    ]))

    await ajustarChegadaAposUltimaEntrega(['RBG5G18'], '2026-09-21', horarioBasePorPlaca, visitasPorPlaca, alvosPorPlaca, nfsUmaNf)

    expect(buscarHorariosBaseMock).toHaveBeenCalledTimes(1)
    expect(buscarHorariosBaseMock).toHaveBeenCalledWith(
      ['RBG5G18'], '2026-09-21', expect.any(Map), false,
      new Map([['RBG5G18', '2026-09-21T13:59:00.000Z']]),
    )
    expect(horarioBasePorPlaca.get('RBG5G18')?.chegadaBase).toBe('2026-09-21T15:02:00.000Z')
    expect(horarioBasePorPlaca.get('RBG5G18')?.kmPercorrido).toBe(80)
    expect(horarioBasePorPlaca.get('RBG5G18')?.saidaBase).toBe('2026-09-21T08:00:00.000Z')
  })

  it('placa com 2 NFs, ambas confirmadas (uma via visita, outra via alvo situacao=1): ajusta', async () => {
    const horarioBasePorPlaca = new Map([
      ['RBG5G18', horario({ saidaBase: '2026-09-21T08:00:00.000Z', chegadaBase: '2026-09-21T19:34:00.000Z', kmPercorrido: 120, paradas: paradasBase })],
    ])
    const visitasPorPlaca = new Map([['RBG5G18', new Map<string, Visita>([['NF1', visita('2026-09-21T13:59:00.000Z')]])]])
    const alvosPorPlaca = new Map<string, AlvoApi[]>([['RBG5G18', [alvo({ documento: 'NF2', situacao: 1 })]]])
    const nfsDuasNf = new Map([['RBG5G18', ['NF1', 'NF2']]])
    buscarHorariosBaseMock.mockResolvedValue(new Map([
      ['RBG5G18', horario({ saidaBase: '2026-09-21T08:00:00.000Z', chegadaBase: '2026-09-21T15:02:00.000Z', kmPercorrido: 80 })],
    ]))

    await ajustarChegadaAposUltimaEntrega(['RBG5G18'], '2026-09-21', horarioBasePorPlaca, visitasPorPlaca, alvosPorPlaca, nfsDuasNf)

    expect(buscarHorariosBaseMock).toHaveBeenCalledTimes(1)
    expect(horarioBasePorPlaca.get('RBG5G18')?.chegadaBase).toBe('2026-09-21T15:02:00.000Z')
  })

  it('placa com uma NF nao confirmada (nem visita, nem alvo feito): nao ajusta, buscarHorariosBase nao e chamado', async () => {
    const horarioBasePorPlaca = new Map([
      ['RBG5G18', horario({ saidaBase: '2026-09-21T08:00:00.000Z', chegadaBase: '2026-09-21T19:34:00.000Z', kmPercorrido: 120, paradas: paradasBase })],
    ])
    const visitasPorPlaca = new Map([['RBG5G18', new Map<string, Visita>([['NF1', visita('2026-09-21T13:59:00.000Z')]])]])
    const alvosPorPlaca = new Map<string, AlvoApi[]>([['RBG5G18', []]])
    // NF2 nao tem visita nem alvo feito -- uma possivel 2a saida pode
    // tê-la entregue de verdade; nao mexe na placa.
    const nfsDuasNfSoUmaConfirmada = new Map([['RBG5G18', ['NF1', 'NF2']]])

    await ajustarChegadaAposUltimaEntrega(['RBG5G18'], '2026-09-21', horarioBasePorPlaca, visitasPorPlaca, alvosPorPlaca, nfsDuasNfSoUmaConfirmada)

    expect(buscarHorariosBaseMock).not.toHaveBeenCalled()
    expect(horarioBasePorPlaca.get('RBG5G18')?.chegadaBase).toBe('2026-09-21T19:34:00.000Z')
    expect(horarioBasePorPlaca.get('RBG5G18')?.kmPercorrido).toBe(120)
  })

  it('2a chamada devolve mapa vazio (ponte falhou): nao muda nada', async () => {
    const horarioBasePorPlaca = new Map([
      ['RBG5G18', horario({ chegadaBase: '2026-09-21T19:34:00.000Z', paradas: paradasBase })],
    ])
    const visitasPorPlaca = new Map([['RBG5G18', new Map<string, Visita>([['NF1', visita('2026-09-21T13:59:00.000Z')]])]])
    const alvosPorPlaca = new Map<string, AlvoApi[]>([['RBG5G18', []]])
    buscarHorariosBaseMock.mockResolvedValue(new Map())

    await ajustarChegadaAposUltimaEntrega(['RBG5G18'], '2026-09-21', horarioBasePorPlaca, visitasPorPlaca, alvosPorPlaca, nfsUmaNf)

    expect(buscarHorariosBaseMock).toHaveBeenCalledTimes(1)
    expect(horarioBasePorPlaca.get('RBG5G18')?.chegadaBase).toBe('2026-09-21T19:34:00.000Z')
  })

  it('2a chamada devolve chegadaBase null: mantem valores da 1a chamada', async () => {
    const horarioBasePorPlaca = new Map([
      ['RBG5G18', horario({ saidaBase: '2026-09-21T08:00:00.000Z', chegadaBase: '2026-09-21T19:34:00.000Z', kmPercorrido: 120, paradas: paradasBase })],
    ])
    const visitasPorPlaca = new Map([['RBG5G18', new Map<string, Visita>([['NF1', visita('2026-09-21T13:59:00.000Z')]])]])
    const alvosPorPlaca = new Map<string, AlvoApi[]>([['RBG5G18', []]])
    buscarHorariosBaseMock.mockResolvedValue(new Map([
      ['RBG5G18', horario({ saidaBase: '2026-09-21T08:00:00.000Z', chegadaBase: null, kmPercorrido: null })],
    ]))

    await ajustarChegadaAposUltimaEntrega(['RBG5G18'], '2026-09-21', horarioBasePorPlaca, visitasPorPlaca, alvosPorPlaca, nfsUmaNf)

    expect(horarioBasePorPlaca.get('RBG5G18')?.chegadaBase).toBe('2026-09-21T19:34:00.000Z')
    expect(horarioBasePorPlaca.get('RBG5G18')?.kmPercorrido).toBe(120)
    expect(horarioBasePorPlaca.get('RBG5G18')?.saidaBase).toBe('2026-09-21T08:00:00.000Z')
  })

  it('placa sem volta extra: buscarHorariosBase nao e chamado de novo', async () => {
    const horarioBasePorPlaca = new Map([
      ['RBG5G18', horario({ chegadaBase: '2026-09-21T19:34:00.000Z', paradas: paradasBase })],
    ])
    // fim da rota 18:00 -> entregou depois de voltar pra base, sem volta extra.
    const visitasPorPlaca = new Map([['RBG5G18', new Map<string, Visita>([['NF1', visita('2026-09-21T18:00:00.000Z')]])]])
    const alvosPorPlaca = new Map<string, AlvoApi[]>([['RBG5G18', []]])

    await ajustarChegadaAposUltimaEntrega(['RBG5G18'], '2026-09-21', horarioBasePorPlaca, visitasPorPlaca, alvosPorPlaca, nfsUmaNf)

    expect(buscarHorariosBaseMock).not.toHaveBeenCalled()
    expect(horarioBasePorPlaca.get('RBG5G18')?.chegadaBase).toBe('2026-09-21T19:34:00.000Z')
  })

  it('loga so as placas efetivamente sobrescritas, separado das pedidas mas nao sobrescritas', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const horarioBasePorPlaca = new Map([
      ['RBG5G18', horario({ saidaBase: '2026-09-21T08:00:00.000Z', chegadaBase: '2026-09-21T19:34:00.000Z', kmPercorrido: 120, paradas: paradasBase })],
      ['OUTRA999', horario({ saidaBase: '2026-09-21T08:00:00.000Z', chegadaBase: '2026-09-21T19:34:00.000Z', kmPercorrido: 100, paradas: paradasBase })],
    ])
    const visitasPorPlaca = new Map([
      ['RBG5G18', new Map<string, Visita>([['NF1', visita('2026-09-21T13:59:00.000Z')]])],
      ['OUTRA999', new Map<string, Visita>([['NF9', visita('2026-09-21T13:59:00.000Z')]])],
    ])
    const alvosPorPlaca = new Map<string, AlvoApi[]>([['RBG5G18', []], ['OUTRA999', []]])
    const nfsDuasPlacas = new Map([['RBG5G18', ['NF1']], ['OUTRA999', ['NF9']]])
    buscarHorariosBaseMock.mockResolvedValue(new Map([
      ['RBG5G18', horario({ saidaBase: '2026-09-21T08:00:00.000Z', chegadaBase: '2026-09-21T15:02:00.000Z', kmPercorrido: 80 })],
      ['OUTRA999', horario({ saidaBase: '2026-09-21T08:00:00.000Z', chegadaBase: null, kmPercorrido: null })],
    ]))

    await ajustarChegadaAposUltimaEntrega(['RBG5G18', 'OUTRA999'], '2026-09-21', horarioBasePorPlaca, visitasPorPlaca, alvosPorPlaca, nfsDuasPlacas)

    const linhas = consoleLogSpy.mock.calls.map(c => c.join(' '))
    expect(linhas.some(l => l.includes('RBG5G18') && l.includes('2026-09-21T19:34:00.000Z') && l.includes('2026-09-21T15:02:00.000Z'))).toBe(true)
    expect(linhas.some(l => l.includes('OUTRA999') && !l.includes('RBG5G18'))).toBe(true)
    consoleLogSpy.mockRestore()
  })
})
