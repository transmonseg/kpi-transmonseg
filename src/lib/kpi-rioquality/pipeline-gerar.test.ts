import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import * as XLSX from 'xlsx'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Ponta a ponta de gerarKpiRioQuality (formato antigo e novo) com geocode e
// GPS falsos -- lacuna apontada no estudo de 30/09 (secao 2). Geocode
// mockado; paradas e km injetados (nada de rede).
// Relogio fixo: DATA (29/09) precisa ficar dentro da janela de 48h da Unitrac
// nos testes que nao passam `hoje` (senao o resultado muda conforme o dia em
// que a suite roda). So' Date e' falso; timers seguem reais.
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-09-30T12:00:00-03:00'))
afterAll(() => { vi.useRealTimers() })

vi.mock('./geocode-coerencia', () => ({ geocodificarPorCoerencia: vi.fn() }))
const geoParciais = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/lib/kpi-romaneio/geocode', () => {
  const geocodificarEnderecos = vi.fn()
  return {
    geocodificarEnderecos,
    geocodificarEnderecosComInfo: vi.fn(async (e: string[], o: unknown) => ({ resultados: await geocodificarEnderecos(e, o), parciais: geoParciais.n })),
  }
})
vi.mock('@/lib/kpi-romaneio/geocode-ancoras', () => ({ reposicionarPorAncoras: vi.fn(async () => new Map()) }))
// ultima comunicacao (posicoes/N/N): nada de rede nos testes; sem dado = sem rotulo novo
vi.mock('@/lib/unitrac-api/posicoes', () => ({ buscarPosicoesPorCv: vi.fn(async () => new Map()) }))

import { geocodificarPorCoerencia } from './geocode-coerencia'
import { gerarKpiRioQuality, OBS_CONSULTA_FALHOU, OBS_CONSULTA_SUSPEITA } from './pipeline'

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
      medirRastro: async () => ({ km: 30, pontosNoDia: 500 }),
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
      medirRastro: async () => ({ km: 30, pontosNoDia: 500 }),
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
      medirRastro: async () => ({ km: null, pontosNoDia: null }),
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
      medirRastro: async () => ({ km: 30, pontosNoDia: 500 }),
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
      medirRastro: async () => ({ km: 0, pontosNoDia: 500 }),
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
      medirRastro: async () => ({ km: 30, pontosNoDia: 500 }),
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
      medirRastro: async () => ({ km: 30, pontosNoDia: 500 }),
    })
    const principal = textos((await abrir(r.xlsx)).worksheets[0])
    expect(principal.some(t => t.includes('TAXA DE CONFIRMAÇÃO: 100,0% (2 de 2 NFs;') && t.includes('2 com consulta ao rastreador falha'))).toBe(true)
  })
})

describe('gerarKpiRioQuality -- sem sinal pela Unitrac e NAO SAIU DA BASE (Task 3)', () => {
  const SEM_RASTREADOR = 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO'
  it('CV com consulta OK, so parada na base e rastro <2 pontos: SEM RASTREADOR (sem sinal), fora da taxa', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['SSS1S11', 'CCC3C33']),
      data: DATA,
      cvPorPlaca: new Map([['SSS1S11', '1'], ['CCC3C33', '3']]),
      buscarParadas: async (_cv, placa) => placa === 'SSS1S11' ? [parada(placa, '06:00', 600, 'BASE', { lat: -22.7, lng: -43.0 })] : [parada(placa, '10:00', 15)],
      medirRastro: async cv => cv === '1' ? { km: null, pontosNoDia: 1 } : { km: 40, pontosNoDia: 900 },
    })
    for (const d of r.detalhe.filter(x => x.placa === 'SSS1S11')) expect(d.observacao).toBe(SEM_RASTREADOR)
  })

  it('rastro desconhecido (consulta do rastro falhou) e 0 paradas: nao conclui sem rastreador', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['SSS1S11']),
      data: DATA,
      cvPorPlaca: new Map([['SSS1S11', '1']]),
      buscarParadas: async () => [],
      medirRastro: async () => ({ km: null, pontosNoDia: null }),
    })
    for (const d of r.detalhe) expect(d.observacao ?? '').not.toMatch(/^SEM RASTREADOR/)
  })

  it('20 de 40 placas sem sinal: nenhuma concluida + aviso da trava', async () => {
    const placas = Array.from({ length: 40 }, (_, i) => `PLC${String(i).padStart(4, '0')}`)
    const semSinal = new Set(placas.slice(0, 20))
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(placas, 1),
      data: DATA,
      cvPorPlaca: new Map(placas.map(p => [p, p])),
      buscarParadas: async (_cv, placa) => semSinal.has(placa) ? [] : [parada(placa, '10:00', 15)],
      medirRastro: async cv => semSinal.has(cv) ? { km: null, pontosNoDia: 0 } : { km: 40, pontosNoDia: 900 },
    })
    for (const d of r.detalhe.filter(x => semSinal.has(x.placa))) expect(d.observacao ?? '').not.toMatch(/^SEM RASTREADOR/)
    expect(r.avisos).toContainEqual(expect.objectContaining({ motivo: 'consulta_posicoes_suspeita', semSinal: 20, totalPlacas: 40 }))
  })

  it('trava disparou (6 de 12 sem sinal): as 6 seguradas saem CONSULTA SUSPEITA fora da taxa; as com paradas seguem normais; aviso cita 6', async () => {
    const placas = Array.from({ length: 12 }, (_, i) => `PLC${String(i).padStart(4, '0')}`)
    const semSinal = new Set(placas.slice(0, 6))
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(placas, 1),
      data: DATA,
      cvPorPlaca: new Map(placas.map(p => [p, p])),
      buscarParadas: async (_cv, placa) => semSinal.has(placa) ? [] : [parada(placa, '10:00', 15)],
      medirRastro: async cv => semSinal.has(cv) ? { km: null, pontosNoDia: 0 } : { km: 40, pontosNoDia: 900 },
    })
    expect(OBS_CONSULTA_SUSPEITA).toBe('CONSULTA AO RASTREADOR SUSPEITA - CONFERIR')
    for (const d of r.detalhe.filter(x => semSinal.has(x.placa))) {
      expect(d.status).toBe('pendente')
      expect(d.observacao).toBe(OBS_CONSULTA_SUSPEITA)
    }
    for (const d of r.detalhe.filter(x => !semSinal.has(x.placa))) expect(d.status).not.toBe('pendente')
    expect(r.avisos).toContainEqual(expect.objectContaining({ motivo: 'consulta_posicoes_suspeita', semSinal: 6, totalPlacas: 12 }))
    const wb = await abrir(r.xlsx)
    expect(textos(wb.getWorksheet('Avisos')!).some(t => t.includes('6 de 12 placas'))).toBe(true)
    // 6 de 6: as 6 NFs das placas seguradas fora da conta
    expect(textos(wb.worksheets[0]).some(t => t.includes('TAXA DE CONFIRMAÇÃO: 100,0% (6 de 6 NFs;'))).toBe(true)
  })

  it('consulta falhou nunca vira sem sinal (mesmo com rastro vazio)', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['AAA1A11']),
      data: DATA,
      cvPorPlaca: new Map([['AAA1A11', '1']]),
      buscarParadas: async () => { throw new Error('x') },
      medirRastro: async () => ({ km: null, pontosNoDia: 0 }),
    })
    for (const d of r.detalhe) expect(d.observacao).toBe(OBS_CONSULTA_FALHOU)
  })

  it('km conhecido <2, rastro com pontos e sem parada fora da base: VEÍCULO NÃO SAIU DA BASE, fora da taxa', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['BBB2B22', 'CCC3C33']),
      data: DATA,
      cvPorPlaca: new Map([['BBB2B22', '2'], ['CCC3C33', '3']]),
      buscarParadas: async (_cv, placa) => placa === 'BBB2B22' ? [] : [parada(placa, '10:00', 15)],
      medirRastro: async cv => cv === '2' ? { km: 0.3, pontosNoDia: 300 } : { km: 40, pontosNoDia: 900 },
    })
    for (const d of r.detalhe.filter(x => x.placa === 'BBB2B22')) expect(d.observacao).toBe('VEÍCULO NÃO SAIU DA BASE')
    const principal = textos((await abrir(r.xlsx)).worksheets[0])
    expect(principal.some(t => t.includes('(2 de 2 NFs;') && t.includes('2 que não saíram da base'))).toBe(true)
  })
})

describe('gerarKpiRioQuality -- avisos e snapshot de paradas (Task 4)', () => {
  it('aba Avisos: placa sem rota no Custos, rota sem entregas, placa sem CV, consulta falhou e trava sem sinal', async () => {
    const placas = Array.from({ length: 12 }, (_, i) => `PLC${String(i).padStart(4, '0')}`)
    const custos = planilha([['Relatório de Custos', null], ['Veículo', 'Rota'], ...placas.map(p => [p, 'NORTE 1']), ['VAZ1A11', 'SUL 9']])
    const entregas = planilha([['Relatório de Entregas', null], ['Placa', 'Endereço'], ...placas.map(p => [p, `RUA ${p}`]), ['SEM0C00', 'RUA X'], ['ERR1E11', 'RUA Y']])
    const semSinal = new Set(placas.slice(0, 6))
    const r = await gerarKpiRioQuality({
      custosBuf: custos, entregasBuf: entregas, data: DATA,
      cvPorPlaca: new Map([...placas.map(p => [p, p] as [string, string]), ['ERR1E11', 'E']]),
      buscarParadas: async (_cv, placa) => {
        if (placa === 'ERR1E11') throw new Error('x')
        return semSinal.has(placa) ? [] : [parada(placa, '10:00', 15)]
      },
      medirRastro: async cv => semSinal.has(cv) ? { km: null, pontosNoDia: 0 } : { km: 40, pontosNoDia: 900 },
    })
    const wb = await abrir(r.xlsx)
    const avisos = wb.getWorksheet('Avisos')
    expect(avisos).toBeDefined()
    const t = textos(avisos!)
    const linhaCom = (placa: string) => {
      const out: string[] = []
      avisos!.eachRow(row => { if (row.getCell(2).value === placa) out.push(String(row.getCell(3).value)) })
      return out
    }
    expect(linhaCom('ERR1E11').join(' ')).toMatch(/Placa sem rota no Relatório de Custos/)
    expect(linhaCom('SEM0C00').join(' ')).toMatch(/Placa sem rota no Relatório de Custos/)
    expect(linhaCom('SEM0C00').join(' ')).toMatch(/placa sem CV — rode descobrir-cv/i)
    expect(linhaCom('VAZ1A11').join(' ')).toMatch(/Rota sem nenhuma entrega/)
    expect(linhaCom('ERR1E11').join(' ')).toMatch(/Consulta ao rastreador falhou/)
    expect(t.some(x => /sem sinal|posições/i.test(x) && x.includes('6'))).toBe(true)
  })

  it('dia fora das 48h: usa o snapshot noturno da RQ (empresa rioquality) e confirma pelas paradas guardadas', async () => {
    const lidos: string[] = []
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['CCC3C33']),
      data: DATA,
      hoje: '2026-10-05',
      cvPorPlaca: new Map([['CCC3C33', '3']]),
      buscarParadas: async () => [],
      medirRastro: async () => ({ km: null, pontosNoDia: null }),
      lerSnapshot: async (empresa, data) => {
        lidos.push(`${empresa}/${data}`)
        return new Map([['CCC3C33', [parada('CCC3C33', '10:00', 15)]]])
      },
    })
    expect(lidos).toEqual([`rioquality/${DATA}`])
    for (const d of r.detalhe) expect(d.status).not.toBe('pendente')
  })

  it('dia fora das 48h sem a placa no snapshot: nao conclui sem sinal (falta de dado nao e sem sinal)', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['CCC3C33']),
      data: DATA,
      hoje: '2026-10-05',
      cvPorPlaca: new Map([['CCC3C33', '3']]),
      buscarParadas: async () => [],
      medirRastro: async () => ({ km: null, pontosNoDia: 0 }),
      lerSnapshot: async () => new Map(),
    })
    for (const d of r.detalhe) expect(d.observacao ?? '').not.toMatch(/^SEM RASTREADOR/)
  })

  it('dia fora das 48h, snapshot existe mas sem a placa (ou gravada []): CONSULTA FALHOU fora da taxa + aviso sem dado do snapshot', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['AAA1A11', 'BBB2B22', 'CCC3C33']),
      data: DATA,
      hoje: '2026-10-05',
      cvPorPlaca: new Map([['AAA1A11', '1'], ['BBB2B22', '2'], ['CCC3C33', '3']]),
      buscarParadas: async () => [],
      medirRastro: async () => ({ km: 30, pontosNoDia: 500 }),
      // AAA1A11 com paradas; BBB2B22 gravada []; CCC3C33 ausente
      lerSnapshot: async () => new Map([['AAA1A11', [parada('AAA1A11', '10:00', 15)]], ['BBB2B22', []]]),
    })
    for (const d of r.detalhe.filter(x => x.placa === 'AAA1A11')) expect(d.status).not.toBe('pendente')
    for (const d of r.detalhe.filter(x => x.placa === 'BBB2B22' || x.placa === 'CCC3C33')) {
      expect(d.status).toBe('pendente')
      expect(d.observacao).toBe(OBS_CONSULTA_FALHOU)
    }
    expect(r.avisos).toContainEqual(expect.objectContaining({ motivo: 'rq_sem_snapshot', placasSemSnapshot: 2 }))
    const wb = await abrir(r.xlsx)
    expect(textos(wb.getWorksheet('Avisos')!).some(t => /sem dado do snapshot para 2 placas/i.test(t))).toBe(true)
    // 2 de 2 NFs confirmadas (as 4 NFs sem dado do snapshot fora da conta)
    const principal = textos(wb.worksheets[0])
    expect(principal.some(t => t.includes('TAXA DE CONFIRMAÇÃO: 100,0% (2 de 2 NFs;'))).toBe(true)
  })

  it('dia dentro das 48h: nao le snapshot', async () => {
    let leu = false
    await gerarKpiRioQuality({
      ...formatoAntigo(['CCC3C33']),
      data: DATA,
      hoje: '2026-09-30',
      cvPorPlaca: new Map([['CCC3C33', '3']]),
      buscarParadas: async (_cv, placa) => [parada(placa, '10:00', 15)],
      medirRastro: async () => ({ km: 30, pontosNoDia: 500 }),
      lerSnapshot: async () => { leu = true; return new Map() },
    })
    expect(leu).toBe(false)
  })
})

describe('gerarKpiRioQuality -- guarda territorial no formato novo (Task 5)', () => {
  it('chama geocodificarEnderecos com validarTerritorio e propaga confiavel/motivo/fonte: endereco em outro municipio vira COORDENADA IMPRECISA, nunca NAO FOI', async () => {
    const { geocodificarEnderecos } = await import('@/lib/kpi-romaneio/geocode')
    const LONGE = { lat: -22.5, lng: -43.9 } // ~70 km do ponto onde a placa parou
    vi.mocked(geocodificarEnderecos).mockImplementation(async enderecos => enderecos.map(e => e.startsWith('RUA LONGE')
      ? { ...LONGE, confiavel: false, motivo: 'municipio_divergente', fonte: 'nominatim' }
      : { ...PONTO, confiavel: true, fonte: 'cnefe' }))
    const completa = planilha([
      ['Razão Social', 'Cidade', 'UF', 'Destino', 'Motorista', 'Placa', 'Endereço', 'Bairro'],
      ['MERCADO A', 'RIO DE JANEIRO', 'RJ', 'NORTE 1', 'JOAO', 'CCC3C33', 'RUA PERTO', 'CENTRO'],
      ['MERCADO B', 'MESQUITA', 'RJ', 'NORTE 1', 'JOAO', 'CCC3C33', 'RUA LONGE', 'CENTRO'],
    ])
    const r = await gerarKpiRioQuality({
      completaBuf: completa, data: DATA,
      cvPorPlaca: new Map([['CCC3C33', '3']]),
      buscarParadas: async (_cv, placa) => [parada(placa, '10:00', 15)],
      medirRastro: async () => ({ km: 40, pontosNoDia: 900 }),
    })
    expect(vi.mocked(geocodificarEnderecos)).toHaveBeenCalledWith(expect.any(Array), { validarTerritorio: true })
    const longe = r.detalhe.find(d => d.clienteNome === 'MERCADO B')!
    expect(longe.status).toBe('pendente')
    expect(longe.observacao).toBe('ENDEREÇO COM COORDENADA IMPRECISA - COORDENADA CAIU EM OUTRO MUNICÍPIO - CONFERIR CADASTRO')
    const perto = r.detalhe.find(d => d.clienteNome === 'MERCADO A')!
    expect(perto.status).not.toBe('pendente')
  })
})

describe('gerarKpiRioQuality -- geocode parcial (incidente 01/10)', () => {
  it('parciais > 0 na cascata vira aviso "geocode parcial -- gere novamente" na aba Avisos', async () => {
    const { geocodificarEnderecos } = await import('@/lib/kpi-romaneio/geocode')
    vi.mocked(geocodificarEnderecos).mockImplementation(async enderecos => enderecos.map(() => ({ ...PONTO, confiavel: true, fonte: 'cnefe' })))
    geoParciais.n = 3
    try {
      const completa = planilha([
        ['Razão Social', 'Cidade', 'UF', 'Destino', 'Motorista', 'Placa', 'Endereço', 'Bairro'],
        ['MERCADO A', 'RIO DE JANEIRO', 'RJ', 'NORTE 1', 'JOAO', 'CCC3C33', 'RUA PERTO', 'CENTRO'],
      ])
      const r = await gerarKpiRioQuality({
        completaBuf: completa, data: DATA,
        cvPorPlaca: new Map([['CCC3C33', '3']]),
        buscarParadas: async (_cv, placa) => [parada(placa, '10:00', 15)],
        medirRastro: async () => ({ km: 40, pontosNoDia: 900 }),
      })
      expect(r.avisos).toContainEqual(expect.objectContaining({ motivo: 'geocode_parcial', enderecosParciais: 3 }))
      const wb = await abrir(r.xlsx)
      expect(textos(wb.getWorksheet('Avisos')!).some(t => /geocode parcial: 3 endereços/i.test(t))).toBe(true)
    } finally {
      geoParciais.n = 0
    }
  })
})

describe('gerarKpiRioQuality -- terceiro formato (55 colunas, NF real)', () => {
  it('detecta pelo cabecalho e gera o KPI com NF real, carga = romaneio, cascata com validarTerritorio', async () => {
    const { CABECALHO_55, LINHAS_55 } = await import('./entregas-55col.fixture')
    const { geocodificarEnderecos } = await import('@/lib/kpi-romaneio/geocode')
    vi.mocked(geocodificarEnderecos).mockImplementation(async enderecos => enderecos.map(() => ({ ...PONTO, confiavel: true, fonte: 'cnefe' })))
    const r = await gerarKpiRioQuality({
      completaBuf: planilha([['Relatório de Entregas'], CABECALHO_55, ...LINHAS_55]), data: DATA,
      cvPorPlaca: new Map([['LAT9F36', '1'], ['LJI4I52', '2'], ['SRJ9H01', '3']]),
      buscarParadas: async (_cv, placa) => [parada(placa, '10:00', 15)],
      medirRastro: async () => ({ km: 40, pontosNoDia: 900 }),
    })
    expect(vi.mocked(geocodificarEnderecos)).toHaveBeenCalledWith(
      expect.arrayContaining(['AVENIDA DAS AMERICAS, - BARRA DA TIJUCA, RIO DE JANEIRO - RJ']), { validarTerritorio: true })
    expect(r.detalhe.map(d => d.nf).sort()).toEqual(['5511706', '5512088', '5512934', '5512949'])
    expect(r.detalhe.find(d => d.nf === '5512949')).toMatchObject({ carga: '1158583', placa: 'LAT9F36' })
  })

  it('arquivo de dia encerrado sem NENHUM check-in vira aviso de relatorio incompleto (RQ 02/10 09:01, taxa 32%)', async () => {
    const { CABECALHO_55, LINHAS_55 } = await import('./entregas-55col.fixture')
    const { geocodificarEnderecos } = await import('@/lib/kpi-romaneio/geocode')
    vi.mocked(geocodificarEnderecos).mockImplementation(async enderecos => enderecos.map(() => ({ ...PONTO, confiavel: true, fonte: 'cnefe' })))
    const iCheck = (CABECALHO_55 as string[]).indexOf('Check-In')
    const semCheckin = (LINHAS_55 as unknown[][]).map(l => l.map((c, i) => (i === iCheck ? 'NÃO' : c)))
    const r = await gerarKpiRioQuality({
      completaBuf: planilha([['Relatório de Entregas'], CABECALHO_55, ...semCheckin]), data: DATA, hoje: '2099-01-01',
      cvPorPlaca: new Map([['LAT9F36', '1'], ['LJI4I52', '2'], ['SRJ9H01', '3']]),
      buscarParadas: async (_cv, placa) => [parada(placa, '10:00', 15)],
      medirRastro: async () => ({ km: 40, pontosNoDia: 900 }),
    })
    expect(r.avisos.some(a => a.motivo === 'rq_relatorio_sem_checkin')).toBe(true)
  })
})

// Corredor da rua (relatorio rq-mesmo-lugar-e-sem-rastreador.md, 01/10): RQ
// manda rua SEM numero; os 61 clientes da AV. DAS AMERICAS (Barra) cairam no
// mesmo ponto (-23.00075,-43.37481). Pontos CNEFE da rua vem da ponte de
// coerencia (pontosZona), so' pras NFs que sobraram pendentes.
describe('gerarKpiRioQuality -- corredor da rua (endereco sem numero, formatos com cidade)', () => {
  const RIO = '3304557'
  const PONTO_BARRA = { lat: -23.00075, lng: -43.37481 }
  const C1 = { lat: -23.0003, lng: -43.3650, municipioCodigo: RIO }
  const C2 = { lat: -23.0005, lng: -43.3950, municipioCodigo: RIO } // ~2 km a oeste do ponto
  const HOMONIMA_CAXIAS = { lat: -22.7000, lng: -43.3000, municipioCodigo: '3301702' }
  const PERTO_C2 = { lat: C2.lat + 0.00135, lng: C2.lng } // ~150 m de C2
  const PERTO_HOMONIMA = { lat: HOMONIMA_CAXIAS.lat + 0.0005, lng: HOMONIMA_CAXIAS.lng }
  const OBS_CORREDOR = 'ENTREGUE - PARADA NA MESMA RUA (endereço sem número, horário aproximado)'

  async function preparar() {
    const { geocodificarEnderecos } = await import('@/lib/kpi-romaneio/geocode')
    vi.mocked(geocodificarEnderecos).mockImplementation(async enderecos => enderecos.map(e => e.startsWith('AV. DAS AMERICAS')
      ? { ...PONTO_BARRA, confiavel: true, fonte: undefined }
      : { ...PONTO, confiavel: true, fonte: 'cnefe' }))
    vi.mocked(geocodificarPorCoerencia).mockImplementation(async grupos => new Map(grupos.map(g => [
      g.id, g.ruas.map(rua => rua === 'AV. DAS AMERICAS'
        ? { ...PONTO_BARRA, municipioCodigo: RIO, confianca: 'media' as const, candidatos: 4, ancora: false, pontosZona: [{ ...PONTO_BARRA, municipioCodigo: RIO }, C1, C2, HOMONIMA_CAXIAS] }
        : { lat: null, lng: null, municipioCodigo: null, confianca: 'sem_candidato' as const, candidatos: 0, ancora: false, pontosZona: [] }),
    ])))
    return planilha([
      ['Razão Social', 'Cidade', 'UF', 'Destino', 'Motorista', 'Placa', 'Endereço', 'Bairro'],
      ['MERCADO A', 'RIO DE JANEIRO', 'RJ', 'SUDOESTE 1', 'JOAO', 'CCC3C33', 'AV. DAS AMERICAS', 'BARRA DA TIJUCA'],
      ['MERCADO B', 'RIO DE JANEIRO', 'RJ', 'SUDOESTE 1', 'JOAO', 'CCC3C33', 'AV. DAS AMERICAS', 'BARRA DA TIJUCA'],
      ['MERCADO C', 'RIO DE JANEIRO', 'RJ', 'SUDOESTE 1', 'JOAO', 'CCC3C33', 'RUA PERTO', 'CENTRO'],
      ['MERCADO D', 'RIO DE JANEIRO', 'RJ', 'SUDOESTE 2', 'PEDRO', 'DDD4D44', 'AV. DAS AMERICAS', 'BARRA DA TIJUCA'],
    ])
  }

  it('parada PROPRIA >= 2 min a <= 200 m de outro ponto da mesma rua/municipio: ENTREGUE com o horario da parada', async () => {
    const completa = await preparar()
    const r = await gerarKpiRioQuality({
      completaBuf: completa, data: DATA,
      cvPorPlaca: new Map([['CCC3C33', '3'], ['DDD4D44', '4']]),
      buscarParadas: async (_cv, placa) => placa === 'CCC3C33'
        ? [parada(placa, '10:00', 15), parada(placa, '13:05', 12, 'FORA_BASE', PERTO_C2)]
        : [parada(placa, '09:00', 20, 'FORA_BASE', { lat: -22.9, lng: -43.5 })],
      medirRastro: async () => ({ km: 40, pontosNoDia: 900 }),
    })
    for (const cliente of ['MERCADO A', 'MERCADO B']) {
      const d = r.detalhe.find(x => x.clienteNome === cliente)!
      expect(d.status).not.toBe('pendente')
      expect(d.observacao).toBe(OBS_CORREDOR)
      expect(d.chegada).toBe(`${DATA}T13:05:00.000Z`)
    }
    // nunca parada de OUTRO veiculo: DDD4D44 nao parou na rua (CCC3C33 sim)
    const outra = r.detalhe.find(x => x.clienteNome === 'MERCADO D')!
    expect(outra.status).toBe('pendente')
    // a ponte so' e' consultada pelas ruas que sobraram pendentes
    const ruasPedidas = vi.mocked(geocodificarPorCoerencia).mock.calls.flatMap(([gs]) => gs.flatMap(g => g.ruas))
    expect(ruasPedidas).toContain('AV. DAS AMERICAS')
    expect(ruasPedidas).not.toContain('RUA PERTO')
  })

  it('parada curta (< 2 min) na rua, ou parada na rua homonima de OUTRO municipio: nao confirma', async () => {
    const completa = await preparar()
    const r = await gerarKpiRioQuality({
      completaBuf: completa, data: DATA,
      cvPorPlaca: new Map([['CCC3C33', '3'], ['DDD4D44', '4']]),
      buscarParadas: async (_cv, placa) => placa === 'CCC3C33'
        ? [parada(placa, '10:00', 15), parada(placa, '13:05', 1, 'FORA_BASE', PERTO_C2)]
        : [parada(placa, '09:00', 20, 'FORA_BASE', PERTO_HOMONIMA)],
      medirRastro: async () => ({ km: 40, pontosNoDia: 900 }),
    })
    for (const cliente of ['MERCADO A', 'MERCADO B', 'MERCADO D']) {
      const d = r.detalhe.find(x => x.clienteNome === cliente)!
      expect(d.status).toBe('pendente')
      expect(d.observacao).not.toBe(OBS_CORREDOR)
    }
  })

  // Item 2: rua longa (pontos CNEFE espalhados por > 1 km) e nenhuma parada
  // da placa na rua -> o ponto pode estar longe do cliente: rotulo honesto em
  // vez de 'NAO FOI AO CLIENTE'. Continua pendente, DENTRO da taxa.
  it('rua longa sem parada da placa na rua: COORDENADA APROXIMADA (RUA SEM NUMERO) - CONFERIR, pendente e dentro da taxa', async () => {
    const completa = await preparar()
    const r = await gerarKpiRioQuality({
      completaBuf: completa, data: DATA,
      cvPorPlaca: new Map([['CCC3C33', '3'], ['DDD4D44', '4']]),
      // so' paradas a ~20 km (PONTO) -> 'NAO FOI' pela distancia
      buscarParadas: async (_cv, placa) => [parada(placa, '10:00', 15)],
      medirRastro: async () => ({ km: 40, pontosNoDia: 900 }),
    })
    for (const cliente of ['MERCADO A', 'MERCADO B', 'MERCADO D']) {
      const d = r.detalhe.find(x => x.clienteNome === cliente)!
      expect(d.status).toBe('pendente')
      expect(d.observacao).toBe('COORDENADA APROXIMADA (RUA SEM NÚMERO) - CONFERIR')
    }
    const wb = await abrir(r.xlsx)
    // 1 confirmada (RUA PERTO) de 4: as 3 da rua longa contam no denominador
    expect(textos(wb.worksheets[0]).some(t => t.includes('TAXA DE CONFIRMAÇÃO: 25,0% (1 de 4 NFs'))).toBe(true)
  })

  it('rua curta (um ponto CNEFE so) sem parada: continua NAO FOI AO CLIENTE', async () => {
    const completa = await preparar()
    vi.mocked(geocodificarPorCoerencia).mockImplementation(async grupos => new Map(grupos.map(g => [
      g.id, g.ruas.map(() => ({ ...PONTO_BARRA, municipioCodigo: RIO, confianca: 'alta' as const, candidatos: 1, ancora: true, pontosZona: [{ ...PONTO_BARRA, municipioCodigo: RIO }] })),
    ])))
    const r = await gerarKpiRioQuality({
      completaBuf: completa, data: DATA,
      cvPorPlaca: new Map([['CCC3C33', '3'], ['DDD4D44', '4']]),
      buscarParadas: async (_cv, placa) => [parada(placa, '10:00', 15)],
      medirRastro: async () => ({ km: 40, pontosNoDia: 900 }),
    })
    expect(r.detalhe.find(x => x.clienteNome === 'MERCADO A')!.observacao).toBe('NÃO FOI AO CLIENTE (caminhão não esteve na região)')
  })

  it('formato antigo (sem cidade) nao usa o corredor novo (coerencia so' + "'" + ' na geocodificacao)', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['AAA1A11']),
      data: DATA,
      cvPorPlaca: new Map([['AAA1A11', '1']]),
      buscarParadas: async (_cv, placa) => [parada(placa, '10:00', 15)],
      medirRastro: async () => ({ km: 40, pontosNoDia: 900 }),
    })
    expect(vi.mocked(geocodificarPorCoerencia)).toHaveBeenCalledTimes(1)
    expect(r.detalhe.every(d => d.observacao !== OBS_CORREDOR)).toBe(true)
  })
})

// Item 3 (relatorio rq-mesmo-lugar-e-sem-rastreador.md, PARTE B): rotulos de
// rastreador fora da taxa, nunca 'NAO SAIU DA BASE'.
describe('gerarKpiRioQuality -- GPS congelado e rastreador sem comunicar (item 3)', () => {
  const LNH_CONGELADO = { lat: -22.6758, lng: -43.271062 } // Duque de Caxias, ~17 km da base
  const BASE_RQ = { lat: -22.814171, lng: -43.344751 }

  it('LNH8A80: rastro do dia todo na mesma coordenada longe da base -> SEM RASTREADOR - GPS CONGELADO, fora da taxa, nem a parada falsa confirma', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['LNH8A80', 'CCC3C33']),
      data: DATA,
      cvPorPlaca: new Map([['LNH8A80', '19381'], ['CCC3C33', '3']]),
      // a "parada" unica do GPS congelado (2.871 min) cai em cima do PONTO das
      // entregas no teste -- mesmo assim nao pode confirmar
      buscarParadas: async (_cv, placa) => placa === 'LNH8A80'
        ? [parada(placa, '00:00', 1439, 'FORA_BASE', PONTO)]
        : [parada(placa, '10:00', 15)],
      medirRastro: async cv => cv === '19381'
        ? { km: 0, pontosNoDia: 590, coordenadaUnicaNoDia: LNH_CONGELADO }
        : { km: 40, pontosNoDia: 900 },
      buscarUltimaComunicacao: async () => new Map([['19381', '01/10/2026 19:22:00']]),
    })
    for (const d of r.detalhe.filter(x => x.placa === 'LNH8A80')) {
      expect(d.status).toBe('pendente')
      expect(d.observacao).toBe('SEM RASTREADOR - GPS CONGELADO')
      expect(d.chegada).toBeNull()
    }
    const principal = textos((await abrir(r.xlsx)).worksheets[0])
    expect(principal.some(t => t.includes('TAXA DE CONFIRMAÇÃO: 100,0% (2 de 2 NFs; 2 sem rastreador fora da conta)'))).toBe(true)
  })

  it('RJM5B51: ultimo GPS 20/08 -> SEM RASTREADOR - SEM COMUNICAR DESDE 20/08, fora da taxa', async () => {
    const pedidos: string[][] = []
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['RJM5B51', 'CCC3C33']),
      data: DATA,
      cvPorPlaca: new Map([['RJM5B51', '15277'], ['CCC3C33', '3']]),
      buscarParadas: async (_cv, placa) => placa === 'RJM5B51' ? [] : [parada(placa, '10:00', 15)],
      medirRastro: async cv => cv === '15277' ? { km: null, pontosNoDia: 0 } : { km: 40, pontosNoDia: 900 },
      buscarUltimaComunicacao: async cvs => { pedidos.push(cvs); return new Map([['15277', '20/08/2026 11:54:21']]) },
    })
    for (const d of r.detalhe.filter(x => x.placa === 'RJM5B51')) {
      expect(d.status).toBe('pendente')
      expect(d.observacao).toBe('SEM RASTREADOR - SEM COMUNICAR DESDE 20/08')
    }
    // so' pergunta a ultima comunicacao de quem nao teve parada fora da base
    expect(pedidos.flat()).toEqual(['15277'])
    const principal = textos((await abrir(r.xlsx)).worksheets[0])
    expect(principal.some(t => t.includes('(2 de 2 NFs; 2 sem rastreador fora da conta)'))).toBe(true)
  })

  it('caminhao normal parado NA BASE o dia todo (comunicando) continua VEÍCULO NÃO SAIU DA BASE', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['BBB2B22', 'CCC3C33']),
      data: DATA,
      cvPorPlaca: new Map([['BBB2B22', '2'], ['CCC3C33', '3']]),
      buscarParadas: async (_cv, placa) => placa === 'BBB2B22' ? [] : [parada(placa, '10:00', 15)],
      medirRastro: async cv => cv === '2' ? { km: 0.3, pontosNoDia: 300, coordenadaUnicaNoDia: BASE_RQ } : { km: 40, pontosNoDia: 900 },
      buscarUltimaComunicacao: async () => new Map([['2', '29/09/2026 21:40:00']]),
    })
    for (const d of r.detalhe.filter(x => x.placa === 'BBB2B22')) expect(d.observacao).toBe('VEÍCULO NÃO SAIU DA BASE')
  })

  it('falha ao consultar a ultima comunicacao nao derruba a geracao (segue o rotulo de antes)', async () => {
    const r = await gerarKpiRioQuality({
      ...formatoAntigo(['RJM5B51', 'CCC3C33']),
      data: DATA,
      cvPorPlaca: new Map([['RJM5B51', '15277'], ['CCC3C33', '3']]),
      buscarParadas: async (_cv, placa) => placa === 'RJM5B51' ? [] : [parada(placa, '10:00', 15)],
      medirRastro: async cv => cv === '15277' ? { km: null, pontosNoDia: 0 } : { km: 40, pontosNoDia: 900 },
      buscarUltimaComunicacao: async () => { throw new Error('timeout') },
    })
    for (const d of r.detalhe.filter(x => x.placa === 'RJM5B51')) {
      expect(d.observacao).toBe('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')
    }
  })
})
