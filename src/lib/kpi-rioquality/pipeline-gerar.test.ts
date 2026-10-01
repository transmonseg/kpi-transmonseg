import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Ponta a ponta de gerarKpiRioQuality (formato antigo e novo) com geocode e
// GPS falsos -- lacuna apontada no estudo de 30/09 (secao 2). Geocode
// mockado; paradas e km injetados (nada de rede).
vi.mock('./geocode-coerencia', () => ({ geocodificarPorCoerencia: vi.fn() }))
vi.mock('@/lib/kpi-romaneio/geocode', () => ({ geocodificarEnderecos: vi.fn() }))
vi.mock('@/lib/kpi-romaneio/geocode-ancoras', () => ({ reposicionarPorAncoras: vi.fn(async () => new Map()) }))

import { geocodificarPorCoerencia } from './geocode-coerencia'
import { gerarKpiRioQuality, OBS_CONSULTA_FALHOU } from './pipeline'

const PONTO = { lat: -22.9, lng: -43.2 }
const DATA = '2026-09-29'

function planilha(aoa: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'R')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

function formatoAntigo(placas: string[], entregasPorPlaca = 2) {
  const custos = planilha([['Relatório de Custos', null], ['Veículo', 'Rota'], ...placas.map(p => [p, 'NORTE 1'])])
  const linhas: unknown[][] = []
  for (const p of placas) for (let i = 1; i <= entregasPorPlaca; i++) linhas.push([p, `RUA ${p} ${i}`])
  const entregas = planilha([['Relatório de Entregas', null], ['Placa', 'Endereço'], ...linhas])
  return { custosBuf: custos, entregasBuf: entregas }
}

function parada(placa: string, hhmm: string, min: number, classificacao = 'FORA_BASE', ponto = PONTO): UnitracParadaRow {
  const chegada = `${DATA}T${hhmm}:00.000Z`
  const saida = new Date(new Date(chegada).getTime() + min * 60_000).toISOString()
  return {
    id: `${placa}-${hhmm}`, placa_norm: placa, chegada, saida, fim_real: saida, duracao_seg: min * 60,
    local_parada: '', codigo_loja: null, nome_loja: null, lat: ponto.lat, lng: ponto.lng, classificacao, ordem: 0,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(geocodificarPorCoerencia).mockImplementation(async grupos => new Map(grupos.map(g => [
    g.id, g.ruas.map(() => ({ ...PONTO, municipioCodigo: null, confianca: 'alta' as const, candidatos: 1, ancora: false, pontosZona: [] })),
  ])))
})

describe('gerarKpiRioQuality -- consulta Unitrac (Task 1: erro != vazio)', () => {
  it('placa com erro na consulta sai CONSULTA FALHOU (nao SEM RASTREADOR, nao ENTREGUE); vazio e com paradas seguem normais; aviso por placa', async () => {
    const chamadas = new Map<string, number>()
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['AAA1A11', 'BBB2B22', 'CCC3C33']),
      data: DATA,
      cvPorPlaca: new Map([['AAA1A11', '1'], ['BBB2B22', '2'], ['CCC3C33', '3']]),
      buscarParadas: async (_cv, placa) => {
        chamadas.set(placa, (chamadas.get(placa) ?? 0) + 1)
        if (placa === 'AAA1A11') throw new Error('timeout')
        if (placa === 'BBB2B22') return []
        return [parada(placa, '10:00', 15)]
      },
      calcularKm: async () => 30,
    })
    const por = (p: string) => r.detalhe.filter(d => d.placa === p)
    for (const d of por('AAA1A11')) {
      expect(d.status).toBe('pendente')
      expect(d.observacao).toBe(OBS_CONSULTA_FALHOU)
      expect(d.chegada).toBeNull()
    }
    // 1 retry antes de concluir erro
    expect(chamadas.get('AAA1A11')).toBe(2)
    for (const d of por('BBB2B22')) expect(d.observacao).not.toBe(OBS_CONSULTA_FALHOU)
    for (const d of por('CCC3C33')) expect(d.status).not.toBe('pendente')
    expect(r.placasConsultaFalhou).toEqual(['AAA1A11'])
    expect(r.avisos).toContainEqual(expect.objectContaining({ placa: 'AAA1A11', motivo: 'consulta_unitrac_falhou' }))
  })

  it('erro na 1a tentativa e sucesso no retry: placa segue normal', async () => {
    let n = 0
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['CCC3C33']),
      data: DATA,
      cvPorPlaca: new Map([['CCC3C33', '3']]),
      buscarParadas: async placa => {
        n++
        if (n === 1) throw new Error('503')
        return [parada('CCC3C33', '10:00', 15)]
      },
      calcularKm: async () => 30,
    })
    expect(r.placasConsultaFalhou).toEqual([])
    for (const d of r.detalhe) expect(d.status).not.toBe('pendente')
  })

  it('concorrencia maxima de 6 consultas ao mesmo tempo', async () => {
    const placas = Array.from({ length: 14 }, (_, i) => `PLC${String(i).padStart(4, '0')}`)
    let emAndamento = 0
    let pico = 0
    await gerarKpiRioQuality({
      ...formatoAntigo(placas, 1),
      data: DATA,
      cvPorPlaca: new Map(placas.map((p, i) => [p, String(i)])),
      buscarParadas: async () => {
        emAndamento++
        pico = Math.max(pico, emAndamento)
        await new Promise(res => setTimeout(res, 5))
        emAndamento--
        return []
      },
      calcularKm: async () => null,
    })
    expect(pico).toBeLessThanOrEqual(6)
    expect(pico).toBeGreaterThan(1)
  })
})
