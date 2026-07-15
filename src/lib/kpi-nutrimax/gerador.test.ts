import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarKpiNutrimax } from './gerador'
import type { EntradaNutrimax, ResumoViagemPlacaNutrimax } from './types'

const entrada: EntradaNutrimax = {
  data: '2026-07-15', carga: '92593', destino: 'CAMPOS', placa: 'TTL7D40', motorista: 'LUAN VIANA',
  nf: '2270025', cliente_codigo: '165049', cliente_nome: 'ANDRE LUIS SILVA VELASCO',
  endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *', status: 'entregue', hora_realizado: '2026-07-15T09:58:18.480Z',
  placa_rastreada: true, placa_duplicada: false,
}

const resumoViagem: ResumoViagemPlacaNutrimax[] = [
  { placaNorm: 'TTL7D40', kmPercorrido: 93.5, qtdParadas: 25, inicioViagem: '2026-07-15T05:07:00.000Z', fimViagem: '2026-07-15T14:08:00.000Z' },
]

describe('gerarKpiNutrimax', () => {
  it('sem resumoViagem, gera só a aba de clientes (comportamento de sempre)', async () => {
    const buf = await gerarKpiNutrimax([entrada])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.worksheets.map(ws => ws.name)).toEqual(['KPI Nutry Max'])
  })

  it('com resumoViagem, adiciona uma 2ª aba "Resumo por Placa" com km/paradas/horários', async () => {
    const buf = await gerarKpiNutrimax([entrada], resumoViagem)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.worksheets.map(ws => ws.name)).toEqual(['KPI Nutry Max', 'Resumo por Placa'])

    const ws = wb.getWorksheet('Resumo por Placa')!
    const linhas = ws.getSheetValues().filter(Boolean).map(r => (r as unknown[]).slice(1))
    expect(linhas).toContainEqual(['PLACA', 'KM PERCORRIDO', 'QTD PARADAS', 'INÍCIO VIAGEM', 'FIM VIAGEM'])
    expect(linhas).toContainEqual(['TTL7D40', 93.5, 25, '2026-07-15T05:07:00.000Z', '2026-07-15T14:08:00.000Z'])
  })

  it('a 1ª aba (clientes) continua igual mesmo com resumoViagem presente', async () => {
    const buf = await gerarKpiNutrimax([entrada], resumoViagem)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]
    expect(ws.getRow(2).values).toEqual([
      , '92593', 'CAMPOS', 'TTL7D40', 'LUAN VIANA', '2270025', 'ANDRE LUIS SILVA VELASCO',
      'RUA X, 1 - BAIRRO, CAMPOS - *', 'entregue', '2026-07-15T09:58:18.480Z', 'SIM', 'NÃO',
    ])
  })
})
