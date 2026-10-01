import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { COLUNAS_DETALHE_PLACA } from '@/lib/kpi-romaneio/gerador-xlsx'
import type { EntregaRioQualityCompleta } from './parse-planilhas'
import { lerDetalheKpiXlsx, medirGabarito, minutosDoDia } from './gabarito'

// Gabarito da RQ (Tarefa B, 30/09): o arquivo de 55 colunas traz o que o
// app do motorista registrou (check-in + status). Mede o KPI contra isso.

async function kpiXlsx(abas: Record<string, (string | null)[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('KPI 2026-09-30').addRow(['RESUMO'])
  for (const [placa, linhas] of Object.entries(abas)) {
    const ws = wb.addWorksheet(placa)
    ws.addRow([`RELATÓRIO KPI - RIO QUALITY - PLACA ${placa}`])
    ws.addRow(['MOTORISTA: X'])
    ws.addRow([...COLUNAS_DETALHE_PLACA])
    for (const l of linhas) ws.addRow(l)
  }
  wb.addWorksheet('Avisos').addRow(['AVISO'])
  return Buffer.from(await wb.xlsx.writeBuffer())
}

function entrega(nf: string, placaNorm: string, status: string, checkIn: string | null): EntregaRioQualityCompleta {
  return {
    placaNorm, clienteNome: 'C', cidade: 'RIO DE JANEIRO', uf: 'RJ', destino: 'D', motorista: 'M', rua: 'R', bairro: 'B', nf,
    gabarito: { status, checkIn: checkIn != null, checkOut: checkIn != null, dataCheckIn: checkIn, dataCheckOut: null, motivoDevolucao: null },
  }
}

describe('minutosDoDia', () => {
  it('le HH:MM e "DD/MM/AAAA HH:MM:SS" (descarta segundos)', () => {
    expect(minutosDoDia('10:30')).toBe(630)
    expect(minutosDoDia('30/09/2026 10:30:43')).toBe(630)
    expect(minutosDoDia('')).toBeNull()
    expect(minutosDoDia('SEM RASTREADOR')).toBeNull()
  })
})

describe('lerDetalheKpiXlsx', () => {
  it('le as abas de placa (pula resumo e Avisos), uma linha por NF', async () => {
    const buf = await kpiXlsx({ AAA1A11: [['1', '100', 'CLI', 'END', '10:05', '10:20', '15 min', 'ENTREGUE']] })
    expect(await lerDetalheKpiXlsx(buf)).toEqual([{ placa: 'AAA1A11', nf: '100', chegada: '10:05', status: 'ENTREGUE' }])
  })
})

describe('medirGabarito', () => {
  it('cobertura, erro de horario, suspeitas e por placa', async () => {
    const buf = await kpiXlsx({
      AAA1A11: [
        ['1', '100', 'C', 'E', '10:05', '10:20', '15 min', 'ENTREGUE'], // check-in 10:00 -> erro 5
        ['1', '101', 'C', 'E', '11:30', '11:40', '10 min', 'ENTREGUE - TEMPO EM LOJA ACIMA DE 4H'], // check-in 11:00 -> erro 30
        ['1', '102', 'C', 'E', '', '', '', 'NÃO FOI AO CLIENTE'], // entregue no gabarito, KPI nao confirma
        ['1', '103', 'C', 'E', '12:00', '12:10', '10 min', 'ENTREGUE'], // Devolvido -> suspeita
      ],
      BBB2B22: [
        ['2', '200', 'C', 'E', '09:00', '09:10', '10 min', 'ENTREGUE'], // Faturado sem check-in -> suspeita
        ['2', '201', 'C', 'E', '08:52', '09:00', '8 min', 'ENTREGUE'], // check-in 09:00 -> erro -8 (KPI antes)
      ],
    })
    const gab = [
      entrega('100', 'AAA1A11', 'Entregue', '30/09/2026 10:00:10'),
      entrega('101', 'AAA1A11', 'Entregue', '30/09/2026 11:00:00'),
      entrega('102', 'AAA1A11', 'Entregue', '30/09/2026 13:00:00'),
      entrega('103', 'AAA1A11', 'Devolvido', '30/09/2026 12:01:00'),
      entrega('200', 'BBB2B22', 'Faturado', null),
      entrega('201', 'BBB2B22', 'Entregue', '30/09/2026 09:00:00'),
      entrega('999', 'BBB2B22', 'Entregue', '30/09/2026 09:30:00'), // nao esta no KPI
    ]
    const m = medirGabarito(await lerDetalheKpiXlsx(buf), gab)
    expect(m.geral.baseEntregueComCheckIn).toBe(5)
    expect(m.geral.confirmadasPeloKpi).toBe(3) // 100, 101, 201
    expect(m.geral.pctConfirmadas).toBeCloseTo(60)
    expect(m.geral.nfsGabaritoForaDoKpi).toBe(1)
    // erros absolutos: 5, 30, 8 (so' NFs entregue+check-in confirmadas)
    expect(m.geral.erroChegada).toEqual({ n: 3, medianaMin: 8, p90Min: 30, pctAte10Min: expect.closeTo(66.67, 1) })
    expect(m.suspeitas.map(s => [s.nf, s.statusGabarito])).toEqual([['103', 'Devolvido'], ['200', 'Faturado']])
    const a = m.porPlaca.find(p => p.placa === 'AAA1A11')!
    expect(a).toMatchObject({ baseEntregueComCheckIn: 3, confirmadasPeloKpi: 2, suspeitas: 1 })
    expect(a.erroChegada.medianaMin).toBe(17.5)
    const b = m.porPlaca.find(p => p.placa === 'BBB2B22')!
    expect(b).toMatchObject({ baseEntregueComCheckIn: 2, confirmadasPeloKpi: 1, suspeitas: 1 })
  })
})
