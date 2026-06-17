import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseKpiManual, classificarStatusManual } from './parse-kpi-manual'

async function makeWb(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('19')
  ws.getRow(3).values = ['REDES / FILIAIS', 'MOTORISTA', 'COD', 'PLACA', 'SAIDA CD', 'CHD LOJA', 'SAIDA LOJA']
  ws.getRow(5).values = ['Princesa - Catete', 'JOAO', '12', 'ABC1D23', '05:10', '06:35', '09:15']
  ws.getRow(6).values = ['Princesa - Flamengo', 'MARIA', '13', 'ABC1D24', 'SEM', 'RASTREADOR', '']
  ws.getRow(7).values = ['Princesa - Leme', 'PEDRO', '14', 'ABC1D25', 'NÃO', 'FOI  AO', 'CLIENTE']
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

describe('parseKpiManual', () => {
  it('extrai status entregue / sem_rastreador / nao_foi por loja', async () => {
    const ents = await parseKpiManual(await makeWb(), 'PRINCESA', '2026-05-19')
    expect(ents).toHaveLength(3)
    const catete = ents.find(e => e.loja.includes('Catete'))!
    expect(catete.status).toBe('entregue')
    expect(catete.chd).toBe('06:35')
    expect(catete.placa).toBe('ABC1D23')
    expect(catete.motorista).toBe('JOAO')
    expect(ents.find(e => e.loja.includes('Flamengo'))!.status).toBe('sem_rastreador')
    expect(ents.find(e => e.loja.includes('Leme'))!.status).toBe('nao_foi')
  })
})

describe('classificarStatusManual', () => {
  it('reconhece todas as legendas ricas, sem descartar', () => {
    expect(classificarStatusManual('DESATUALIZADO', false)).toBe('desatualizado')
    expect(classificarStatusManual('SEM RASTREADOR', false)).toBe('sem_rastreador')
    expect(classificarStatusManual('MUDOU DE ROTA - CONFERIR', false)).toBe('mudou_de_rota')
    expect(classificarStatusManual('EM ROTA', false)).toBe('em_rota')
    expect(classificarStatusManual('AGUARDANDO BASE', false)).toBe('em_rota')
    expect(classificarStatusManual('NÃO SAIU DA BASE', false)).toBe('nao_foi')
    expect(classificarStatusManual('NÃO FOI AO CLIENTE', false)).toBe('nao_foi')
    expect(classificarStatusManual('', true)).toBe('entregue')   // tem chegada
    expect(classificarStatusManual('', false)).toBe('indefinido') // nunca descarta
  })
  it('desatualizado tem prioridade sobre rastreador; em rota não vira não foi', () => {
    expect(classificarStatusManual('DESATUALIZADO SEM RASTREADOR', false)).toBe('desatualizado')
    expect(classificarStatusManual('EM ROTA', false)).not.toBe('nao_foi')
  })
})
