import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  parseKpiManual,
  parseKpiManualTodasAbas,
  classificarStatusManual,
  ehAbaDia,
} from './parse-kpi-manual'

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

describe('ehAbaDia — tolerante a como a aba é nomeada', () => {
  it('aceita número puro, data BR e dia embutido', () => {
    expect(ehAbaDia('19')).toBe(19)
    expect(ehAbaDia('01')).toBe(1)
    expect(ehAbaDia('19-05')).toBe(19)   // data com dia primeiro (Excel proíbe "/")
    expect(ehAbaDia('19.05')).toBe(19)
    expect(ehAbaDia('DIA 19')).toBe(19)
    expect(ehAbaDia('SEG 19')).toBe(19)
    expect(ehAbaDia('19 SEG')).toBe(19)
  })
  it('ignora abas auxiliares e valores fora de 1..31', () => {
    expect(ehAbaDia('matriz')).toBeNull()
    expect(ehAbaDia('BASE')).toBeNull()
    expect(ehAbaDia('endereço filiais')).toBeNull()
    expect(ehAbaDia('2026')).toBeNull()  // ano, não dia
    expect(ehAbaDia('32')).toBeNull()
    expect(ehAbaDia('')).toBeNull()
  })
})

describe('parseWorksheet — robusto a layout (header, coluna, cabeçalho variante)', () => {
  it('acha o header na linha 2, coluna de loja deslocada e "CHEGADA LOJA"', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('20')
    // coluna de índice "#" antes da loja, header na linha 2, "CHEGADA LOJA" (não "CHD")
    ws.getRow(2).values = ['#', 'REDES / FILIAIS', 'MOTORISTA', 'PLACA', 'SAIDA CD', 'CHEGADA LOJA', 'SAIDA LOJA']
    ws.getRow(3).values = [1, 'Assaí - Bangu I', 'JOAO', 'ABC1D23', '05:10', '06:35', '09:15']
    const buf = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
    const ents = await parseKpiManual(buf, 'ASSAI', '2026-05-20')
    expect(ents).toHaveLength(1)
    expect(ents[0].loja).toBe('Assaí - Bangu I')
    expect(ents[0].motorista).toBe('JOAO')
    expect(ents[0].chd).toBe('06:35')
    expect(ents[0].status).toBe('entregue')
  })
})

describe('parseKpiManualTodasAbas — abas-dia variantes e diagnóstico', () => {
  it('lê abas com nomes variantes e ignora auxiliares', async () => {
    const wb = new ExcelJS.Workbook()
    for (const nome of ['19-05', 'DIA 20', 'matriz', 'BASE']) {
      const ws = wb.addWorksheet(nome)
      ws.getRow(3).values = ['REDES / FILIAIS', 'MOTORISTA', 'PLACA', 'SAIDA CD', 'CHEGADA LOJA', 'SAIDA LOJA']
      ws.getRow(4).values = ['Assaí - Bangu', 'JOAO', 'ABC1D23', '05:10', '06:35', '09:15']
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
    const { entradas, dias, diag } = await parseKpiManualTodasAbas(buf, 'ASSAI', '2026-05')
    expect(dias).toEqual(['2026-05-19', '2026-05-20'])
    expect(entradas).toHaveLength(2)
    expect(diag.abasDia).toEqual(['19-05', 'DIA 20'])
  })
  it('diagnóstico aponta quando nenhuma aba parece um dia', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Planilha1')
    ws.getRow(3).values = ['REDES / FILIAIS', 'MOTORISTA', 'PLACA', 'SAIDA CD', 'CHEGADA LOJA', 'SAIDA LOJA']
    ws.getRow(4).values = ['Assaí - Bangu', 'JOAO', 'ABC1D23', '05:10', '06:35', '09:15']
    const buf = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
    const { entradas, diag } = await parseKpiManualTodasAbas(buf, 'ASSAI', '2026-05')
    expect(entradas).toHaveLength(0)
    expect(diag.abasDia).toHaveLength(0)
    expect(diag.abas).toContain('Planilha1')
  })
})

describe('classificarStatusManual', () => {
  it('reconhece todas as legendas ricas, consolidadas em 4 categorias, sem descartar', () => {
    expect(classificarStatusManual('DESATUALIZADO', false)).toBe('sem_rastreador')
    expect(classificarStatusManual('SEM RASTREADOR', false)).toBe('sem_rastreador')
    expect(classificarStatusManual('MUDOU DE ROTA - CONFERIR', false)).toBe('nao_foi')
    expect(classificarStatusManual('EM ROTA', false)).toBe('indefinido')
    expect(classificarStatusManual('AGUARDANDO BASE', false)).toBe('indefinido')
    expect(classificarStatusManual('NÃO SAIU DA BASE', false)).toBe('nao_foi')
    expect(classificarStatusManual('NÃO FOI AO CLIENTE', false)).toBe('nao_foi')
    expect(classificarStatusManual('', true)).toBe('entregue')   // tem chegada
    expect(classificarStatusManual('', false)).toBe('indefinido') // nunca descarta
  })
  it('desatualizado cai em sem_rastreador; em rota cai em indefinido, não em não foi', () => {
    expect(classificarStatusManual('DESATUALIZADO SEM RASTREADOR', false)).toBe('sem_rastreador')
    expect(classificarStatusManual('EM ROTA', false)).not.toBe('nao_foi')
  })
})
