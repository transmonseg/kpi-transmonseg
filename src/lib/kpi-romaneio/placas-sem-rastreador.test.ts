import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = mocks.eq
    return { from: () => q }
  },
}))

import {
  placasSemRastreadorNoDia,
  buscarPlacasSemRastreador,
  montarTemRastreadorPorPlaca,
  placaSemSinalNoDia,
  placasSemSinalNoDia,
  type PlacaSemRastreadorRow,
} from './placas-sem-rastreador'
import type { HorarioBase } from './base-horarios'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { montarDetalheEntregas } from './agregacao'

const linha = (o: Partial<PlacaSemRastreadorRow>): PlacaSemRastreadorRow => ({
  id: 1, empresa: 'NUTRY MAX', placa: 'TTL5J17', inicio: '2026-09-23', fim: null,
  motivo: 'informado pela operação 24/09', responsavel: 'Ana', criado_em: '2026-09-24T10:00:00Z', ...o,
})

describe('placasSemRastreadorNoDia', () => {
  it('antes do inicio: nao conta', () => {
    const s = placasSemRastreadorNoDia([linha({ inicio: '2026-09-23' })], '2026-09-22')
    expect(s.has('TTL5J17')).toBe(false)
  })

  it('dentro da vigencia (fim null): conta', () => {
    const s = placasSemRastreadorNoDia([linha({ inicio: '2026-09-23', fim: null })], '2026-09-24')
    expect(s.has('TTL5J17')).toBe(true)
  })

  it('no dia exato do inicio: conta', () => {
    const s = placasSemRastreadorNoDia([linha({ inicio: '2026-09-23', fim: null })], '2026-09-23')
    expect(s.has('TTL5J17')).toBe(true)
  })

  it('depois do fim: nao conta', () => {
    const s = placasSemRastreadorNoDia([linha({ inicio: '2026-09-23', fim: '2026-09-25' })], '2026-09-26')
    expect(s.has('TTL5J17')).toBe(false)
  })

  it('no dia exato do fim: ainda conta', () => {
    const s = placasSemRastreadorNoDia([linha({ inicio: '2026-09-23', fim: '2026-09-25' })], '2026-09-25')
    expect(s.has('TTL5J17')).toBe(true)
  })

  it('normaliza a placa (minusculas/traço)', () => {
    const s = placasSemRastreadorNoDia([linha({ placa: 'ttl-5j17' })], '2026-09-24')
    expect(s.has('TTL5J17')).toBe(true)
  })
})

describe('buscarPlacasSemRastreador', () => {
  beforeEach(() => mocks.eq.mockReset())

  it('devolve as linhas da empresa', async () => {
    mocks.eq.mockResolvedValue({ data: [linha({})], error: null })
    const r = await buscarPlacasSemRastreador('NUTRY MAX')
    expect(r).toHaveLength(1)
    expect(r[0].placa).toBe('TTL5J17')
  })

  it('erro de leitura nao quebra: devolve vazio', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.eq.mockResolvedValue({ data: null, error: { message: 'tabela nao existe' } })
    await expect(buscarPlacasSemRastreador('NUTRY MAX')).resolves.toEqual([])
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('montarTemRastreadorPorPlaca', () => {
  it('placa declarada sem rastreador vence "VEICULO SEM MOVIMENTO": tem cv E ponte, mesmo assim sai false', () => {
    // Caso real TTL5J17: tem `cv` na Unitrac e a ponte respondeu (paradas so' na
    // BASE) -- pelo dado seria "veiculo parado", nao "sem rastreador". A
    // declaracao manual da operacao vence as duas fontes.
    const cvPorPlaca = new Map([['TTL5J17', 'cv-1']])
    const horarioBasePorPlaca = new Map([['TTL5J17', { paradas: [] }]])
    const semRastreador = new Set(['TTL5J17'])
    const r = montarTemRastreadorPorPlaca(['TTL5J17'], cvPorPlaca, horarioBasePorPlaca, semRastreador)
    expect(r.get('TTL5J17')).toBe(false)
  })

  it('placa nao declarada: mantem o calculo de cv/ponte de sempre', () => {
    const cvPorPlaca = new Map([['AAA1A11', 'cv-2']])
    const horarioBasePorPlaca = new Map<string, unknown>()
    const r = montarTemRastreadorPorPlaca(['AAA1A11', 'BBB2B22'], cvPorPlaca, horarioBasePorPlaca, new Set())
    expect(r.get('AAA1A11')).toBe(true)
    expect(r.get('BBB2B22')).toBe(false)
  })

  // Achado real 26/09 (grupo, KPI de 25/09): XXX0000 e' a placa
  // PROVISORIA/generica da Escala/Romaneio da Nutry Max quando a carga ainda
  // nao tem caminhao definido -- nao e' um veiculo de verdade, nunca teve
  // rastreador. Mesmo com cv/ponte respondendo por acidente (texto casando
  // por coincidencia), tem que sair sem rastreador sempre -- ver
  // PLACA_GENERICA_SEM_RASTREADOR em constants.ts.
  it('XXX0000 (placa generica/provisoria): sempre sem rastreador, mesmo com cv E ponte respondendo', () => {
    const cvPorPlaca = new Map([['XXX0000', 'cv-9']])
    const horarioBasePorPlaca = new Map([['XXX0000', { paradas: [] }]])
    const r = montarTemRastreadorPorPlaca(['XXX0000'], cvPorPlaca, horarioBasePorPlaca, new Set())
    expect(r.get('XXX0000')).toBe(false)
  })
})

// 29/09 (ordem direta do usuario, KPI-Nutry-Max-2026-09-29): placa da escala
// SEM SINAL NO DIA (ponte com <2 posicoes no dia inteiro, nenhuma parada fora
// da base na Unitrac, nenhum alvo 'feito') vira SEM RASTREADOR automatico --
// nunca "aguardando", mesmo com o dia em andamento.
// consultaPosicoesOk: a ponte CONSULTOU as posicoes da placa com sucesso
// (resposta trouxe `paradas`, mesmo vazia) -- ver base-horarios.ts.
const HORARIO_SEM_POSICAO: HorarioBase = { saidaBase: null, chegadaBase: null, kmPercorrido: null, paradas: [], apagaoDeSinal: false, consultaPosicoesOk: true }
// Erro/timeout na consulta de posicoes da placa do lado da ponte (erroPosicoes
// em base-horarios/route.ts do monitoramento): resposta tudo null, SEM paradas.
const HORARIO_CONSULTA_FALHOU: HorarioBase = { saidaBase: null, chegadaBase: null, kmPercorrido: null }
const paradaU = (o: Partial<UnitracParadaRow>): UnitracParadaRow => ({
  id: 'p1', placa_norm: 'X', chegada: '2026-09-29T08:00:00.000Z', saida: '2026-09-29T08:30:00.000Z',
  duracao_seg: 1800, local_parada: '', codigo_loja: null, nome_loja: null, lat: -22.9, lng: -43.2,
  classificacao: 'FORA_BASE', ordem: 0, ...o,
})

describe('placaSemSinalNoDia (detecao automatica, SEM SINAL NO DIA)', () => {
  it('consulta de posicoes da placa falhou (erro/timeout: ponte responde tudo null, sem paradas): NAO conclui sem sinal', () => {
    expect(placaSemSinalNoDia(HORARIO_CONSULTA_FALHOU, [], [])).toBe(false)
  })

  it('RQV8J31 (fora da frota do monitoramento): mesma resposta do erro de consulta, indistinguivel -- NAO conclui (Falha de consulta nunca conclui)', () => {
    expect(placaSemSinalNoDia(HORARIO_CONSULTA_FALHOU, [], [])).toBe(false)
  })

  it('consulta com marca explicita de falha, mesmo com paradas vazias: NAO conclui', () => {
    expect(placaSemSinalNoDia({ ...HORARIO_SEM_POSICAO, consultaPosicoesOk: false }, [], [])).toBe(false)
  })

  it('RQU5J45 (na frota, nunca transmitiu: paradas da ponte vazias): sem sinal', () => {
    expect(placaSemSinalNoDia(HORARIO_SEM_POSICAO, [], [])).toBe(true)
  })

  it('RQO9H37 29/09 (0 posicoes; Unitrac so\' devolve a parada na BASE do dia anterior): sem sinal', () => {
    const naBase = paradaU({ classificacao: 'BASE', chegada: '2026-09-28T11:17:00.000Z', saida: null })
    expect(placaSemSinalNoDia({ ...HORARIO_SEM_POSICAO, paradas: [] }, [naBase], [])).toBe(true)
  })

  it('ponte fora do ar (sem entrada da placa): NAO conclui nada', () => {
    expect(placaSemSinalNoDia(undefined, [], [])).toBe(false)
  })

  it('RQU6E83 28/09 (com posicoes, 0 km): NAO e\' sem sinal (segue VEICULO NAO SAIU DA BASE)', () => {
    expect(placaSemSinalNoDia({ saidaBase: null, chegadaBase: null, kmPercorrido: 0, paradas: [] }, [], [])).toBe(false)
  })

  it('apagao parcial com paradas fora da base: nada muda', () => {
    const h: HorarioBase = {
      saidaBase: '2026-09-29T06:00:00.000Z', chegadaBase: null, kmPercorrido: 42, apagaoDeSinal: true,
      paradas: [{ chegada: '2026-09-29T08:00:00.000Z', saida: '2026-09-29T08:20:00.000Z', duracaoSeg: 1200, lat: -22.9, lng: -43.2, classificacao: 'FORA_BASE' }],
    }
    expect(placaSemSinalNoDia(h, [paradaU({})], [])).toBe(false)
  })

  it('ponte sem posicao mas Unitrac com parada FORA da base: tem sinal', () => {
    expect(placaSemSinalNoDia(HORARIO_SEM_POSICAO, [paradaU({ classificacao: 'FORA_BASE' })], [])).toBe(false)
  })

  it('ponte sem posicao mas alvo Unitrac feito (situacao 1): tem sinal', () => {
    expect(placaSemSinalNoDia(HORARIO_SEM_POSICAO, [], [{ situacao: 1 }])).toBe(false)
  })

  it('ponte com parada derivada (qualquer): tem sinal', () => {
    const h: HorarioBase = { ...HORARIO_SEM_POSICAO, paradas: [{ chegada: 'a', saida: 'b', duracaoSeg: 600, lat: 1, lng: 1, classificacao: 'BASE' }] }
    expect(placaSemSinalNoDia(h, [], [])).toBe(false)
  })

  it('ponte com visita/menor distancia calculada (houve posicao na janela): tem sinal', () => {
    const h: HorarioBase = { ...HORARIO_SEM_POSICAO, visitasPorNf: new Map([['NF1', { chegada: null, saida: null, menorDistanciaM: 3000 }]]) }
    expect(placaSemSinalNoDia(h, [], [])).toBe(false)
  })
})

describe('placasSemSinalNoDia + montarTemRastreadorPorPlaca', () => {
  it('placa sem sinal sai temRastreador=false mesmo com cv e ponte respondendo', () => {
    const horarios = new Map<string, HorarioBase>([
      ['RQV8J31', HORARIO_SEM_POSICAO],
      ['RQU6E83', { saidaBase: null, chegadaBase: null, kmPercorrido: 0, paradas: [] }],
    ])
    const semSinal = placasSemSinalNoDia(['RQV8J31', 'RQU6E83'], horarios, new Map(), new Map())
    expect([...semSinal]).toEqual(['RQV8J31'])
    const r = montarTemRastreadorPorPlaca(['RQV8J31', 'RQU6E83'], new Map([['RQV8J31', 'cv'], ['RQU6E83', 'cv']]), horarios, new Set(), semSinal)
    expect(r.get('RQV8J31')).toBe(false)
    expect(r.get('RQU6E83')).toBe(true)
  })

  it('dia EM ANDAMENTO: NF da placa sem sinal sai SEM RASTREADOR, nunca AGUARDANDO', () => {
    const linha = { carga: 'PAO-1', placa: 'RQV8J31', nf: '216254', clienteCodigo: 'C1', clienteNome: 'PREZUNIC', endereco: 'R VOLUNTARIOS DA PATRIA,222', lat: -22.95, lng: -43.19 }
    const det = montarDetalheEntregas(
      'PAO-1', 'RQV8J31', [linha] as never, [], new Map(),
      { motorista: 'Luis Paulo', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null },
      false, new Map([['RQV8J31', []]]), null, true, true, true, new Map(), true, true, true,
    )
    expect(det[0].observacao).toBe('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')
  })
})
