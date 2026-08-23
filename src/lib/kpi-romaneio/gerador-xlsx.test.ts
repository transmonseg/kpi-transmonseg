import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarKpiRomaneioXlsx, COLUNAS_KPI_ROMANEIO } from './gerador-xlsx'
import type { LinhaKpiRomaneio } from './types'

describe('gerador-xlsx', () => {
  it('gera workbook com header exato', async () => {
    const linhas: LinhaKpiRomaneio[] = []
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    expect(ws.name).toBe('KPI 2026-08-23')

    const headerRow = ws.getRow(1)
    const headerValues = headerRow.values as unknown[]
    // Célula A1 começa no índice 1, não 0
    expect(headerValues.slice(1)).toEqual([...COLUNAS_KPI_ROMANEIO])
  })

  it('linha com todos campos preenchidos produz valores formatados certos', async () => {
    const linhas: LinhaKpiRomaneio[] = [
      {
        carga: 'C001',
        placa: 'ABC1234',
        destino: 'SAO PAULO',
        motorista: 'JOAO SILVA',
        ajudante1: 'MARIA',
        ajudante2: 'PEDRO',
        pesoKg: 1500.5,
        clientesPlanejados: 5,
        nfPlanejado: 10,
        paradasReais: 4,
        kmPercorrido: 125.7,
        saidaCd: '2026-08-23T08:30:00.000Z',
        chegadaCd: '2026-08-23T17:45:00.000Z',
        tempoOperacaoMin: 549, // 9h 9min
        status: 'OK',
      },
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    const dataRow = ws.getRow(2) // primeira linha de dados (2, pois 1 é header)
    const dataValues = dataRow.values as unknown[]

    // Remove índice 0 (vazio do ExcelJS)
    const values = dataValues.slice(1)

    expect(values[0]).toBe('C001') // CARGA
    expect(values[1]).toBe('ABC1234') // PLACA
    expect(values[2]).toBe('SAO PAULO') // DESTINO
    expect(values[3]).toBe('JOAO SILVA') // MOTORISTA
    expect(values[4]).toBe('MARIA') // AJUDANTE 1
    expect(values[5]).toBe('PEDRO') // AJUDANTE 2
    expect(values[6]).toBe(1500.5) // PESO (KG)
    expect(values[7]).toBe(5) // CLIENTES PLANEJADOS
    expect(values[8]).toBe(10) // NF PLANEJADO
    expect(values[9]).toBe(4) // PARADAS REAIS
    expect(values[10]).toBe(125.7) // KM PERCORRIDO (arredondado para 1 casa)
    // valores de hora vão depender da zona horária, então verificamos formato
    expect(typeof values[11]).toBe('string') // SAÍDA CD (formatado)
    expect(typeof values[12]).toBe('string') // CHEGADA CD (formatado)
    expect(values[13]).toBe('9h09min') // TEMPO OPERAÇÃO (formatado em XhYYmin)
    expect(values[14]).toBe('OK') // STATUS
  })

  it('campos null viram string vazia', async () => {
    const linhas: LinhaKpiRomaneio[] = [
      {
        carga: 'C002',
        placa: 'XYZ5678',
        destino: 'RIO DE JANEIRO',
        motorista: 'CARLOS',
        ajudante1: null,
        ajudante2: null,
        pesoKg: null,
        clientesPlanejados: null,
        nfPlanejado: null,
        paradasReais: 2,
        kmPercorrido: null,
        saidaCd: null,
        chegadaCd: null,
        tempoOperacaoMin: null,
        status: 'INCOMPLETO',
      },
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    const dataRow = ws.getRow(2)
    const dataValues = dataRow.values as unknown[]
    const values = dataValues.slice(1)

    expect(values[4]).toBe('') // AJUDANTE 1
    expect(values[5]).toBe('') // AJUDANTE 2
    expect(values[6]).toBe('') // PESO (KG)
    expect(values[7]).toBe('') // CLIENTES PLANEJADOS
    expect(values[8]).toBe('') // NF PLANEJADO
    expect(values[10]).toBe('') // KM PERCORRIDO
    expect(values[11]).toBe('') // SAÍDA CD
    expect(values[12]).toBe('') // CHEGADA CD
    expect(values[13]).toBe('') // TEMPO OPERAÇÃO
  })

  it('arredonda KM PERCORRIDO para 1 casa decimal', async () => {
    const linhas: LinhaKpiRomaneio[] = [
      {
        carga: 'C003',
        placa: 'DEF9012',
        destino: 'BELO HORIZONTE',
        motorista: 'FERNANDO',
        ajudante1: null,
        ajudante2: null,
        pesoKg: null,
        clientesPlanejados: null,
        nfPlanejado: null,
        paradasReais: 1,
        kmPercorrido: 123.456, // deve virar 123.5
        saidaCd: null,
        chegadaCd: null,
        tempoOperacaoMin: null,
        status: 'OK',
      },
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    const dataRow = ws.getRow(2)
    const dataValues = dataRow.values as unknown[]
    const values = dataValues.slice(1)

    expect(values[10]).toBe(123.5)
  })

  it('formata tempo em horas e minutos (XhYYmin)', async () => {
    const linhas: LinhaKpiRomaneio[] = [
      {
        carga: 'C004',
        placa: 'GHI3456',
        destino: 'BRASILIA',
        motorista: 'LUCIA',
        ajudante1: null,
        ajudante2: null,
        pesoKg: null,
        clientesPlanejados: null,
        nfPlanejado: null,
        paradasReais: 1,
        kmPercorrido: null,
        saidaCd: null,
        chegadaCd: null,
        tempoOperacaoMin: 125, // 2h 5min
        status: 'OK',
      },
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    const dataRow = ws.getRow(2)
    const dataValues = dataRow.values as unknown[]
    const values = dataValues.slice(1)

    expect(values[13]).toBe('2h05min')
  })
})
