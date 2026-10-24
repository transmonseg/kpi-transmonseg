import { describe, it, expect, vi, afterAll } from 'vitest'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// F2-06 (MON-13): na RQ a saida/chegada do CD sai dos eventos BASE das
// paradas (precisa de 2+). Em 22/10, 17 de 99 placas sem saida; a ponte do
// monitoramento responde para elas (LTT9C55 06:24 BRT, JIE8C41 06:05,
// SRL9A58 04:22). Caso LTT9C55 22/10: so' a volta (BASE 23:14) nas paradas
// resolvidas -- a manha na base veio com o GPS atrasado (GN-02).
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-24T10:00:00-03:00'))
afterAll(() => { vi.useRealTimers() })

vi.mock('./geocode-coerencia', () => ({ geocodificarPorCoerencia: vi.fn(async () => new Map()) }))
vi.mock('@/lib/kpi-romaneio/geocode', () => ({
  geocodificarEnderecosComInfo: vi.fn(async (enderecos: string[]) => ({
    resultados: enderecos.map(() => ({ lat: -22.8216833, lng: -43.3171083, confiavel: true, fonte: 'cnefe' })),
    parciais: 0,
  })),
}))
vi.mock('@/lib/kpi-romaneio/geocode-ancoras', () => ({ reposicionarPorAncoras: vi.fn(async () => new Map()) }))
vi.mock('./enviar-monitoramento-rq', () => ({ buscarCoordenadasMonitoramentoRQ: vi.fn(async () => new Map()) }))
vi.mock('./cache-corredor', () => ({ lerCorredorDoCache: vi.fn(async () => new Map()), gravarCorredorNoCache: vi.fn(async () => 0) }))

import { gerarKpiRioQuality, completarHorariosPelaPonte } from './pipeline'
import type { LinhaKpiRomaneio } from '@/lib/kpi-romaneio/types'

const p = (id: string, chegada: string, fim: string, lat: number, lng: number, classificacao = 'FORA_BASE'): UnitracParadaRow => ({
  id: `LTT9C55-${id}`, placa_norm: 'LTT9C55', chegada: `2026-10-22T${chegada}.000Z`, saida: `2026-10-22T${fim}.000Z`, fim_real: `2026-10-22T${fim}.000Z`,
  duracao_seg: 0, local_parada: '', codigo_loja: null, nome_loja: null, lat, lng, classificacao, ordem: 0,
})
const PARADAS = [
  p('api-2', '06:31:42', '06:39:42', -22.8216833, -43.3171083),
  p('api-35', '23:14:10', '23:52:10', -22.8143316, -43.3442166, 'BASE'),
]
const entrega = { placaNorm: 'LTT9C55', clienteNome: 'C', cidade: 'RIO DE JANEIRO', uf: 'RJ', destino: 'NORTE FLU 4', motorista: 'M', rua: 'RUA A', bairro: 'B', nf: '1', clienteCodigo: '1', romaneio: '1168659', rota: 'NORTE FLU 4' }

describe('F2-06: RQ usa a ponte quando a saida do pipeline vem nula', () => {
  it('LTT9C55 22/10: saida 06:24 e chegada 23:10 da ponte', async () => {
    const pedidas: string[][] = []
    const r = await gerarKpiRioQuality({
      entregasCompletas: [entrega], data: '2026-10-22', hoje: '2026-10-24', cvPorPlaca: new Map([['LTT9C55', '9']]),
      buscarParadas: async () => PARADAS,
      medirRastro: async () => ({ km: 438, pontosNoDia: 2800 }),
      buscarUltimaComunicacao: async () => new Map(),
      buscarHorariosPonte: async placas => {
        pedidas.push(placas)
        return new Map([['LTT9C55', { saidaBase: '2026-10-22T06:24:12.000Z', chegadaBase: '2026-10-22T23:10:30.000Z', kmPercorrido: 397.9 }]])
      },
    })
    expect(pedidas).toEqual([['LTT9C55']])
    expect(r.linhasKpi[0].saidaCd).toBe('2026-10-22T06:24:12.000Z')
    expect(r.linhasKpi[0].chegadaCd).toBe('2026-10-22T23:10:30.000Z')
    expect(r.detalhe[0].saidaCd).toBe('2026-10-22T06:24:12.000Z')
  })
})

describe('completarHorariosPelaPonte', () => {
  const l = { saidaCd: null, chegadaCd: '2026-10-22T23:14:10.000Z', tempoOperacaoMin: null } as unknown as LinhaKpiRomaneio
  it('saida do pipeline existe ou ponte sem resposta: nada muda', () => {
    const comSaida = { ...l, saidaCd: '2026-10-22T06:21:50.000Z' }
    expect(completarHorariosPelaPonte(comSaida, { saidaBase: '2026-10-22T06:24:00.000Z', chegadaBase: null, kmPercorrido: 1 })).toBe(comSaida)
    expect(completarHorariosPelaPonte(l, undefined)).toBe(l)
  })
  it('ponte sem chegada mantem a chegada do pipeline e calcula o tempo de operacao', () => {
    const r = completarHorariosPelaPonte(l, { saidaBase: '2026-10-22T06:24:00.000Z', chegadaBase: null, kmPercorrido: 1 })
    expect(r.chegadaCd).toBe('2026-10-22T23:14:10.000Z')
    expect(r.tempoOperacaoMin).toBe(1010)
  })
  it('ponte so' + " com o pernoite sem sinal: saida estimada", () => {
    const r = completarHorariosPelaPonte(l, { saidaBase: null, chegadaBase: null, kmPercorrido: 1, saidaSemSinalAte: '2026-10-22T07:02:00.000Z' })
    expect(r.saidaCd).toBeNull()
    expect(r.saidaCdSemSinalAte).toBe('2026-10-22T07:02:00.000Z')
  })
})
