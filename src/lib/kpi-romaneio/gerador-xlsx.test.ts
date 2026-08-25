import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarKpiRomaneioXlsx, COLUNAS_KPI_ROMANEIO, COLUNAS_DETALHAMENTO, COLUNAS_AVISOS } from './gerador-xlsx'
import type { AvisoDescasamento, LinhaKpiRomaneio, LinhaDetalheEntrega } from './types'

// Achado real 24/08 (pedido do usuário, referência
// KPI-GUANABARA-2026-08-23-com-chegada-cd.xlsx): banner de título mesclado
// na linha 1 -- header de coluna desceu pra linha 2, dados começam na 3.
const LINHA_HEADER = 2
const LINHA_PRIMEIRO_DADO = 3

describe('gerador-xlsx', () => {
  it('gera workbook com banner de título na linha 1 e header exato na linha 2', async () => {
    const linhas: LinhaKpiRomaneio[] = []
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    expect(ws.name).toBe('KPI 2026-08-23')

    const tituloCell = ws.getCell(1, 1)
    expect(tituloCell.value).toContain('RELATÓRIO KPI - NUTRY MAX')
    expect(tituloCell.value).toContain('Domingo, 23 de Agosto de 2026') // 23/08/2026 é domingo

    const headerRow = ws.getRow(LINHA_HEADER)
    const headerValues = headerRow.values as unknown[]
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
        tempoMedioParadaMin: 12,
        status: 'OK',
      },
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    const dataRow = ws.getRow(LINHA_PRIMEIRO_DADO)
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
    expect(values[14]).toBe('0h12min') // TEMPO MÉDIO POR ENTREGA
    expect(values[15]).toBe('OK') // STATUS
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
        tempoMedioParadaMin: null,
        status: 'INCOMPLETO',
      },
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    const dataRow = ws.getRow(LINHA_PRIMEIRO_DADO)
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
    expect(values[14]).toBe('') // TEMPO MÉDIO POR ENTREGA
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
        tempoMedioParadaMin: null,
        status: 'OK',
      },
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    const dataRow = ws.getRow(LINHA_PRIMEIRO_DADO)
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
        tempoMedioParadaMin: null,
        status: 'OK',
      },
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    const dataRow = ws.getRow(LINHA_PRIMEIRO_DADO)
    const dataValues = dataRow.values as unknown[]
    const values = dataValues.slice(1)

    expect(values[13]).toBe('2h05min')
  })

  it('achado real 24/08: TEMPO OPERAÇÃO negativo nunca deveria existir na origem, mas o formatador tambem nao inventa "-1h-1min" -- vira vazio', async () => {
    const linhas: LinhaKpiRomaneio[] = [
      {
        carga: 'C005', placa: 'JKL0000', destino: 'X', motorista: 'Y',
        ajudante1: null, ajudante2: null, pesoKg: null, clientesPlanejados: null, nfPlanejado: null,
        paradasReais: 1, kmPercorrido: null, saidaCd: null, chegadaCd: null,
        tempoOperacaoMin: -128, tempoMedioParadaMin: null, status: 'OK',
      },
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const values = (wb.worksheets[0].getRow(LINHA_PRIMEIRO_DADO).values as unknown[]).slice(1)
    expect(values[13]).toBe('')
  })

  it('pedido do usuário 24/08 ("filtrável por placa"): autoFilter cobre header + todas as linhas de dado, nas duas abas', async () => {
    const linhas: LinhaKpiRomaneio[] = [
      {
        carga: 'C001', placa: 'ABC1234', destino: 'X', motorista: 'Y',
        ajudante1: null, ajudante2: null, pesoKg: null, clientesPlanejados: null, nfPlanejado: null,
        paradasReais: 1, kmPercorrido: null, saidaCd: null, chegadaCd: null,
        tempoOperacaoMin: null, tempoMedioParadaMin: null, status: 'OK',
      },
      {
        carga: 'C002', placa: 'DEF5678', destino: 'Y', motorista: 'Z',
        ajudante1: null, ajudante2: null, pesoKg: null, clientesPlanejados: null, nfPlanejado: null,
        paradasReais: 1, kmPercorrido: null, saidaCd: null, chegadaCd: null,
        tempoOperacaoMin: null, tempoMedioParadaMin: null, status: 'OK',
      },
    ]
    const detalhe: LinhaDetalheEntrega[] = [
      { carga: 'C001', placa: 'ABC1234', nf: 'NF1', clienteNome: 'A', endereco: 'A', chegada: null, saida: null, tempoParadaMin: null, status: 'pendente' },
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    expect(ws.autoFilter).toBe('A2:P4') // header linha 2, 2 linhas de dado (linha 3 e 4), 16 colunas (A..P)

    const wsDetalhe = wb.getWorksheet('Detalhamento')!
    expect(wsDetalhe.autoFilter).toBe('A2:I3') // header linha 2, 1 linha de dado (linha 3), 9 colunas (A..I)
  })

  it('sem avisos: nao cria a aba Avisos, mas Detalhamento sempre existe', async () => {
    const buffer = await gerarKpiRomaneioXlsx([], '2026-08-23', [])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    expect(wb.worksheets.map(w => w.name)).toEqual(['KPI 2026-08-23', 'Detalhamento'])
  })

  it('com avisos: cria a aba Avisos com header e uma linha por descasamento', async () => {
    const avisos: AvisoDescasamento[] = [
      { carga: '111', placa: 'AAA1111', motivo: 'sem_romaneio' },
      { carga: '222', placa: 'BBB2222', motivo: 'sem_escala' },
    ]
    const buffer = await gerarKpiRomaneioXlsx([], '2026-08-23', avisos)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    expect(wb.worksheets.map(w => w.name)).toEqual(['KPI 2026-08-23', 'Detalhamento', 'Avisos'])

    const wsAvisos = wb.getWorksheet('Avisos')!
    const headerValues = (wsAvisos.getRow(1).values as unknown[]).slice(1)
    expect(headerValues).toEqual([...COLUNAS_AVISOS])

    const row1 = (wsAvisos.getRow(2).values as unknown[]).slice(1)
    expect(row1).toEqual(['111', 'AAA1111', 'sem romaneio'])

    const row2 = (wsAvisos.getRow(3).values as unknown[]).slice(1)
    expect(row2).toEqual(['222', 'BBB2222', 'sem escala'])
  })

  describe('aba Detalhamento', () => {
    it('header exato na linha 2 (banner na 1, igual a aba principal)', async () => {
      const buffer = await gerarKpiRomaneioXlsx([], '2026-08-23')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsDetalhe = wb.getWorksheet('Detalhamento')!
      expect(wsDetalhe.getCell(1, 1).value).toContain('RELATÓRIO KPI - NUTRY MAX')
      const headerValues = (wsDetalhe.getRow(LINHA_HEADER).values as unknown[]).slice(1)
      expect(headerValues).toEqual([...COLUNAS_DETALHAMENTO])
    })

    it('uma linha por entrega, com status legivel e tempo de parada formatado', async () => {
      const detalhe: LinhaDetalheEntrega[] = [
        {
          carga: 'C001', placa: 'ABC1234', nf: 'NF1', clienteNome: 'CLIENTE A', endereco: 'RUA A, 1',
          chegada: '2026-08-23T10:00:00.000Z', saida: '2026-08-23T10:15:00.000Z', tempoParadaMin: 15,
          status: 'confirmado_gps',
        },
        {
          carga: 'C001', placa: 'ABC1234', nf: 'NF2', clienteNome: 'CLIENTE B', endereco: 'RUA B, 2',
          chegada: null, saida: null, tempoParadaMin: null, status: 'pendente',
        },
      ]
      const buffer = await gerarKpiRomaneioXlsx([], '2026-08-23', [], detalhe)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsDetalhe = wb.getWorksheet('Detalhamento')!

      const linha1 = (wsDetalhe.getRow(LINHA_PRIMEIRO_DADO).values as unknown[]).slice(1)
      expect(linha1[0]).toBe('C001')
      expect(linha1[2]).toBe('NF1')
      expect(linha1[3]).toBe('CLIENTE A')
      expect(linha1[7]).toBe('0h15min')
      expect(linha1[8]).toBe('CONFIRMADO (GPS)')

      const linha2 = (wsDetalhe.getRow(LINHA_PRIMEIRO_DADO + 1).values as unknown[]).slice(1)
      expect(linha2[5]).toBe('') // CHEGADA
      expect(linha2[6]).toBe('') // SAÍDA
      expect(linha2[7]).toBe('') // TEMPO NA PARADA
      expect(linha2[8]).toBe('PENDENTE')
    })
  })
})
