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

async function abrir(xlsx: Buffer) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(xlsx as never)
  return wb
}
function textos(ws: import('exceljs').Worksheet): string[] {
  const out: string[] = []
  ws.eachRow(r => r.eachCell(c => { if (typeof c.value === 'string') out.push(c.value) }))
  return out
}

describe('gerarKpiRioQuality -- pacote de relatorio (Task 2)', () => {
  it('placa sem CV sai SEM RASTREADOR (NAO CONTABILIZADO) e fica fora da taxa; linha de TAXA com denominador', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['CCC3C33', 'SEM0C00']),
      data: DATA,
      cvPorPlaca: new Map([['CCC3C33', '3']]),
      buscarParadas: async (_cv, placa) => [parada(placa, '10:00', 15)],
      calcularKm: async () => 30,
    })
    for (const d of r.detalhe.filter(x => x.placa === 'SEM0C00')) {
      expect(d.observacao).toBe('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')
    }
    const wb = await abrir(r.xlsx)
    const principal = textos(wb.worksheets[0])
    // 2 confirmadas de 2 (as 2 NFs da placa sem CV fora da conta)
    expect(principal.some(t => t.includes('TAXA DE CONFIRMAÇÃO: 100,0% (2 de 2 NFs; 2 sem rastreador fora da conta)'))).toBe(true)
  })

  it('resumo (NF CONFIRMADAS) == linhas ENTREGUE do detalhe em toda placa', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['AAA1A11', 'BBB2B22', 'CCC3C33', 'SEM0C00'], 3),
      data: DATA,
      cvPorPlaca: new Map([['AAA1A11', '1'], ['BBB2B22', '2'], ['CCC3C33', '3']]),
      buscarParadas: async (_cv, placa) => {
        if (placa === 'AAA1A11') throw new Error('x')
        if (placa === 'BBB2B22') return []
        return [parada(placa, '10:00', 15)]
      },
      calcularKm: async () => 0,
    })
    for (const l of r.linhasKpi) {
      const entregues = r.detalhe.filter(d => d.placa === l.placa && d.carga === l.carga && d.status !== 'pendente').length
      expect(l.paradasReais).toBe(entregues)
    }
  })

  it('linha sem placa vira CARGA SEM PLACA, fora da taxa, sem sumir do relatorio', async () => {
    const custos = planilha([['Relatório de Custos', null], ['Veículo', 'Rota'], ['CCC3C33', 'NORTE 1']])
    const entregas = planilha([['Relatório de Entregas', null], ['Placa', 'Endereço'], ['CCC3C33', 'RUA A'], [null, 'RUA SEM DONO']])
    const r = await gerarKpiRioQuality({
      custosBuf: custos, entregasBuf: entregas, data: DATA,
      cvPorPlaca: new Map([['CCC3C33', '3']]),
      buscarParadas: async (_cv, placa) => [parada(placa, '10:00', 15)],
      calcularKm: async () => 30,
    })
    const semPlaca = r.detalhe.filter(d => d.placa === '')
    expect(semPlaca).toHaveLength(1)
    expect(semPlaca[0].observacao).toMatch(/^CARGA SEM PLACA/)
    const principal = textos((await abrir(r.xlsx)).worksheets[0])
    expect(principal.some(t => t.includes('(1 de 1 NFs;') && t.includes('1 de carga sem placa'))).toBe(true)
  })

  it('consulta falhou fica fora da taxa (nem sucesso nem falha)', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['AAA1A11', 'CCC3C33']),
      data: DATA,
      cvPorPlaca: new Map([['AAA1A11', '1'], ['CCC3C33', '3']]),
      buscarParadas: async (_cv, placa) => {
        if (placa === 'AAA1A11') throw new Error('x')
        return [parada(placa, '10:00', 15)]
      },
      calcularKm: async () => 30,
    })
    const principal = textos((await abrir(r.xlsx)).worksheets[0])
    expect(principal.some(t => t.includes('TAXA DE CONFIRMAÇÃO: 100,0% (2 de 2 NFs;') && t.includes('2 com consulta ao rastreador falha'))).toBe(true)
  })
})
