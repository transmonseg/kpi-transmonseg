import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { montarXlsxMensal } from './export-mensal'
import type { EntradaManual } from './parse-kpi-manual'

describe('montarXlsxMensal', () => {
  it('gera buffer com uma aba por dia', async () => {
    const ents: EntradaManual[] = [
      { rede_id: 'ASSAI', data: '2026-05-19', loja: 'A', placa: 'P', motorista: 'M', status: 'entregue', saida_cd: '05:00', chd: '06:00', sai: '06:30' },
      { rede_id: 'ASSAI', data: '2026-05-20', loja: 'A', placa: 'P', motorista: 'M', status: 'nao_foi', saida_cd: null, chd: null, sai: null },
      { rede_id: 'PRINCESA', data: '2026-05-19', loja: 'X', placa: 'Q', motorista: 'N', status: 'entregue', saida_cd: '04:00', chd: '05:00', sai: '05:30' },
    ]
    const buf = await montarXlsxMensal('ASSAI', '2026-05', ents)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.worksheets.map(w => w.name).sort()).toEqual(['19', '20'])
  })
})
