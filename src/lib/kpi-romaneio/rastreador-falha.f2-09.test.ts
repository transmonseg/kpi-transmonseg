import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { avaliarRastreadoresNoDia, LIMIAR_FRACAO_RASTREADOR_COM_FALHA } from './placas-sem-rastreador'
import { montarDetalheEntregas, OBS_RASTREADOR_COM_FALHA } from './agregacao'
import { categoriaPendencia } from './resumo-dashboard'
import type { HorarioBase } from './base-horarios'
import type { LinhaGeocodificada } from './types'

// F2-09 (KN-06, D-05). Fixture: leiturasPorFaixa da ponte nova (MON 105403b)
// calculada sobre posicoes_historico real -- 20/10 com todas as placas da
// rota (apagao do coletor 07:55-09:30), demais dias so' as placas do caso.
const FIXTURE = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'leituras-por-faixa-nutrimax.json'), 'utf8')) as Record<string, Record<string, string>>
function horarios(dia: string): Map<string, HorarioBase> {
  return new Map(Object.entries(FIXTURE[dia]).map(([placa, txt]) => [placa, {
    saidaBase: null, chegadaBase: null, kmPercorrido: 100,
    leiturasPorFaixa: txt.split(' ').map(f => f.split('.').map(Number)),
  }]))
}

describe('avaliarRastreadoresNoDia (D-05: > 30% das leituras fora da base atrasadas, 05-21 h)', () => {
  it('limiar da decisao D-05', () => {
    expect(LIMIAR_FRACAO_RASTREADOR_COM_FALHA).toBe(0.3)
  })

  it('RQV9B26 15, 16 e 22/10: rastreador com falha', () => {
    for (const dia of ['2026-10-15', '2026-10-16', '2026-10-22']) {
      const h = horarios(dia)
      expect(avaliarRastreadoresNoDia([...h.keys()], h).falhas.has('RQV9B26')).toBe(true)
    }
  })

  it('22/10: carro sadio que dorme cedo na garagem (RQU1B50, TOS1H26, RBH9H53) nao entra', () => {
    const h = horarios('2026-10-22')
    const { falhas } = avaliarRastreadoresNoDia([...h.keys()], h)
    for (const p of ['RQU1B50', 'TOS1H26', 'RBH9H53']) expect(falhas.has(p)).toBe(false)
  })

  it('20/10: apagao do coletor 08:00-09:30 vira aviso de coletor, nao de placa (RQV9B26 fora)', () => {
    const h = horarios('2026-10-20')
    const r = avaliarRastreadoresNoDia([...h.keys()], h)
    expect(r.coletorFora).toEqual([{ inicio: '08:00', fim: '09:30' }])
    expect(r.falhas.has('RQV9B26')).toBe(false)
  })

  it('ponte antiga (sem leiturasPorFaixa): nada conclui', () => {
    const h = new Map<string, HorarioBase>([['RQV9B26', { saidaBase: null, chegadaBase: null, kmPercorrido: 1 }]])
    expect(avaliarRastreadoresNoDia(['RQV9B26'], h)).toEqual({ coletorFora: [], falhas: new Map() })
  })
})

describe('montarDetalheEntregas com rastreadorComFalhaNoDia', () => {
  const linha = (nf: string, lat: number, lng: number): LinhaGeocodificada => ({
    carga: '100678', destino: 'X', placa: 'RQV9B26', motorista: 'M', ajudantes: [], nf, clienteCodigo: nf, clienteNome: 'C', endereco: `E${nf}`, lat, lng, pontoCorroborado: true,
  })
  // 22/10: STEMEL CAKES (2438536) e SUPER COMPRAS (2438528) sem parada perto.
  const linhas = [linha('2438536', -22.716394, -43.243831), linha('2438528', -22.633078, -43.260591)]
  const montar = (falha: boolean) => montarDetalheEntregas(
    '100678', 'RQV9B26', linhas, [], new Map(),
    { motorista: 'M', saidaCd: null, chegadaCd: '2026-10-22T15:16:41.000Z', tempoOperacaoMin: null },
    true, new Map([['RQV9B26', [{ id: 'x', placa_norm: 'RQV9B26', chegada: '2026-10-22T11:10:25.000Z', saida: '2026-10-22T11:32:25.000Z', fim_real: '2026-10-22T11:32:25.000Z', duracao_seg: 1320, local_parada: '', codigo_loja: null, nome_loja: null, lat: -22.5911933, lng: -43.3165599, classificacao: 'FORA_BASE', ordem: 0 }]]]),
    73.9, false, false, false, new Map(), true, true, true, linhas, false, new Map(), true, true, false, new Map(), false, true, 0.5, falha,
  )

  it('sem falha: NAO FOI; com falha: RASTREADOR COM FALHA NO DIA - CONFERIR, pendente e sem horario', () => {
    expect(montar(false).every(d => d.observacao?.startsWith('NÃO FOI AO CLIENTE'))).toBe(true)
    const r = montar(true)
    expect(r.every(d => d.status === 'pendente' && d.observacao === OBS_RASTREADOR_COM_FALHA && d.chegada === null)).toBe(true)
    expect(categoriaPendencia(OBS_RASTREADOR_COM_FALHA)).toBe('Rastreador com falha')
  })
})

describe('avisos F2-09 na aba Avisos', async () => {
  const { textoAviso } = await import('./gerador-xlsx')
  it('coletor fora e rastreador com falha', () => {
    expect(textoAviso({ carga: '—', placa: '—', motivo: 'coletor_fora', intervalo: '08:00–09:30' })).toMatch(/^COLETOR FORA 08:00–09:30/)
    expect(textoAviso({ carga: '—', placa: 'RQV9B26', motivo: 'rastreador_com_falha', fracaoAtrasada: 0.503 })).toMatch(/^RASTREADOR COM FALHA NO DIA: 50%/)
  })
})
