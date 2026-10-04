import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarKpiRomaneioXlsx, COLUNAS_KPI_ROMANEIO, COLUNAS_DETALHE_PLACA, COLUNAS_RESOLUCAO, COLUNAS_AVISOS } from './gerador-xlsx'
import type { AvisoDescasamento, LinhaKpiRomaneio, LinhaDetalheEntrega } from './types'

// Achado real 24/08 (pedido do usuário, referência
// KPI-GUANABARA-2026-08-23-com-chegada-cd.xlsx): banner de título mesclado
// na linha 1 -- header de coluna desceu pra linha 2, dados começam na 3.
const LINHA_HEADER = 2
const LINHA_PRIMEIRO_DADO = 3

function linhaKpi(overrides: Partial<LinhaKpiRomaneio> = {}): LinhaKpiRomaneio {
  return {
    carga: 'C001', placa: 'ABC1234', destino: 'X', motorista: 'Y',
    ajudante1: null, ajudante2: null, pesoKg: null, clientesPlanejados: null, nfPlanejado: null,
    paradasReais: 1, paradasForaBase: 0, kmPercorrido: null, saidaCd: null, chegadaCd: null,
    tempoOperacaoMin: null, tempoMedioParadaMin: null, status: 'OK',
    temRastreador: true,
    ...overrides,
  }
}

function detalheFixture(overrides: Partial<LinhaDetalheEntrega> = {}): LinhaDetalheEntrega {
  return {
    carga: 'C001', placa: 'ABC1234', motorista: 'JOAO SILVA', clienteCodigo: 'CLI001',
    nf: 'NF1', clienteNome: 'CLIENTE A', endereco: 'RUA A, 1',
    saidaCd: '2026-08-23T06:00:00.000Z', chegadaCd: '2026-08-23T19:00:00.000Z', tempoOperacaoMin: 780,
    chegada: null, saida: null, tempoParadaMin: null, status: 'pendente',
    temRastreador: true, observacao: null,
    evidencia: 'sem_evidencia', distParadaM: null,
    motivo: 'Sem confirmação de entrega para este cliente', confianca: 'NÃO CONFIRMADO',
    ...overrides,
  }
}

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
      linhaKpi({
        carga: 'C001', placa: 'ABC1234', destino: 'SAO PAULO', motorista: 'JOAO SILVA',
        ajudante1: 'MARIA', ajudante2: 'PEDRO', pesoKg: 1500.5, clientesPlanejados: 5,
        nfPlanejado: 10, paradasReais: 4, paradasForaBase: 3, kmPercorrido: 125.7,
        saidaCd: '2026-08-23T08:30:00.000Z', chegadaCd: '2026-08-23T17:45:00.000Z',
        tempoOperacaoMin: 549, tempoMedioParadaMin: 12, status: 'OK',
      }),
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
    expect(values[9]).toBe(4) // NF CONFIRMADAS (ex-"PARADAS REAIS", Task 9)
    expect(values[10]).toBe(3) // PARADAS FORA DA BASE (Task 9)
    expect(values[11]).toBe(125.7) // KM PERCORRIDO (arredondado para 1 casa)
    // Achado real 25/08: o ISO de saidaCd/chegadaCd já vem em BRT mascarado
    // como UTC (ver comentário de formatarHora em gerador-xlsx.ts) -- os
    // dígitos do horário devem sair EXATAMENTE como vieram, sem conversão
    // de fuso nenhuma (bug anterior aplicava America/Sao_Paulo em cima de
    // um valor que já não precisava, atrasando todo horário exibido em 3h).
    expect(values[12]).toBe('08:30') // SAÍDA CD (formatado, sem shift de fuso)
    expect(values[13]).toBe('17:45') // CHEGADA CD (formatado, sem shift de fuso)
    expect(values[14]).toBe('9h09min') // TEMPO OPERAÇÃO (formatado em XhYYmin)
    expect(values[15]).toBe('0h12min') // TEMPO MÉDIO POR ENTREGA
    // STATUS (OK/INCOMPLETO) removido da tela principal (pedido 25/08) --
    // values[16] nao existe mais.
  })

  it('campos null viram string vazia', async () => {
    const linhas: LinhaKpiRomaneio[] = [
      linhaKpi({ carga: 'C002', placa: 'XYZ5678', destino: 'RIO DE JANEIRO', motorista: 'CARLOS', paradasReais: 2, status: 'INCOMPLETO' }),
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
    expect(values[11]).toBe('') // KM PERCORRIDO
    expect(values[12]).toBe('') // SAÍDA CD
    expect(values[13]).toBe('') // CHEGADA CD
    expect(values[14]).toBe('') // TEMPO OPERAÇÃO
    expect(values[15]).toBe('') // TEMPO MÉDIO POR ENTREGA
  })

  it('arredonda KM PERCORRIDO para 1 casa decimal', async () => {
    const linhas: LinhaKpiRomaneio[] = [
      linhaKpi({ carga: 'C003', placa: 'DEF9012', destino: 'BELO HORIZONTE', motorista: 'FERNANDO', kmPercorrido: 123.456 }),
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    const dataRow = ws.getRow(LINHA_PRIMEIRO_DADO)
    const dataValues = dataRow.values as unknown[]
    const values = dataValues.slice(1)

    expect(values[11]).toBe(123.5)
  })

  it('formata tempo em horas e minutos (XhYYmin)', async () => {
    const linhas: LinhaKpiRomaneio[] = [
      linhaKpi({ carga: 'C004', placa: 'GHI3456', destino: 'BRASILIA', motorista: 'LUCIA', tempoOperacaoMin: 125 }),
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    const dataRow = ws.getRow(LINHA_PRIMEIRO_DADO)
    const dataValues = dataRow.values as unknown[]
    const values = dataValues.slice(1)

    expect(values[14]).toBe('2h05min')
  })

  it('achado real 24/08: TEMPO OPERAÇÃO negativo nunca deveria existir na origem, mas o formatador tambem nao inventa "-1h-1min" -- vira vazio', async () => {
    const linhas: LinhaKpiRomaneio[] = [
      linhaKpi({ carga: 'C005', placa: 'JKL0000', tempoOperacaoMin: -128 }),
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const values = (wb.worksheets[0].getRow(LINHA_PRIMEIRO_DADO).values as unknown[]).slice(1)
    expect(values[14]).toBe('')
  })

  it('pedido do usuário 24/08 ("filtrável por placa"): autoFilter cobre header + todas as linhas de dado na aba principal', async () => {
    const linhas: LinhaKpiRomaneio[] = [
      linhaKpi({ carga: 'C001', placa: 'ABC1234' }),
      linhaKpi({ carga: 'C002', placa: 'DEF5678' }),
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const ws = wb.worksheets[0]
    expect(ws.autoFilter).toBe('A2:P4') // header linha 2, 2 linhas de dado (linha 3 e 4), 16 colunas (A..P, sem STATUS)
  })

  it('sem avisos e sem placa nenhuma: nao cria abas extra', async () => {
    const buffer = await gerarKpiRomaneioXlsx([], '2026-08-23', [])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    expect(wb.worksheets.map(w => w.name)).toEqual(['KPI 2026-08-23'])
  })

  it('aviso de geocode parcial (incidente 01/10, busca por similaridade limitada) sai na aba Avisos pedindo pra gerar de novo', async () => {
    const avisos: AvisoDescasamento[] = [{ carga: '—', placa: '—', motivo: 'geocode_parcial', enderecosParciais: 37 }]
    const buffer = await gerarKpiRomaneioXlsx([], '2026-08-23', avisos)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const row1 = (wb.getWorksheet('Avisos')!.getRow(2).values as unknown[]).slice(1)
    expect(row1).toEqual(['—', '—', 'Geocode parcial: 37 endereços sem a busca completa (banco sobrecarregado) — gere novamente'])
  })

  it('aviso de consulta de posicoes suspeita (coletor fora do ar) sai na aba Avisos com o texto claro', async () => {
    const avisos: AvisoDescasamento[] = [{ carga: '—', placa: '—', motivo: 'consulta_posicoes_suspeita', semSinal: 20, totalPlacas: 40 }]
    const buffer = await gerarKpiRomaneioXlsx([], '2026-08-23', avisos)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const row1 = (wb.getWorksheet('Avisos')!.getRow(2).values as unknown[]).slice(1)
    expect(row1).toEqual(['—', '—', 'Consulta de posições suspeita: 20 de 40 placas sem sinal — não concluído'])
  })

  it('com avisos: cria a aba Avisos com header e uma linha por descasamento', async () => {
    const avisos: AvisoDescasamento[] = [
      { carga: '111', placa: 'AAA1111', motivo: 'sem_romaneio' },
      { carga: '222', placa: 'BBB2222', motivo: 'sem_escala' },
    ]
    const buffer = await gerarKpiRomaneioXlsx([], '2026-08-23', avisos)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    expect(wb.worksheets.map(w => w.name)).toEqual(['KPI 2026-08-23', 'Avisos'])

    const wsAvisos = wb.getWorksheet('Avisos')!
    const headerValues = (wsAvisos.getRow(1).values as unknown[]).slice(1)
    expect(headerValues).toEqual([...COLUNAS_AVISOS])

    const row1 = (wsAvisos.getRow(2).values as unknown[]).slice(1)
    expect(row1).toEqual(['111', 'AAA1111', 'sem romaneio'])

    const row2 = (wsAvisos.getRow(3).values as unknown[]).slice(1)
    expect(row2).toEqual(['222', 'BBB2222', 'sem escala'])
  })

  describe('abas por placa (pedido do usuário 25/08)', () => {
    it('uma aba por placa, nomeada com a própria placa, na ordem em que aparecem na aba principal', async () => {
      const linhas: LinhaKpiRomaneio[] = [
        linhaKpi({ carga: 'C001', placa: 'ABC1234' }),
        linhaKpi({ carga: 'C002', placa: 'DEF5678' }),
      ]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)

      expect(wb.worksheets.map(w => w.name)).toEqual(['KPI 2026-08-23', 'ABC1234', 'DEF5678'])
    })

    it('banner com a placa no título, linha de resumo (motorista/saída/chegada/tempo/km) na linha 2, header exato na linha 3', async () => {
      const linhas: LinhaKpiRomaneio[] = [
        linhaKpi({
          carga: 'C001', placa: 'ABC1234', motorista: 'JOAO SILVA', kmPercorrido: 125.7,
          saidaCd: '2026-08-23T08:30:00.000Z', chegadaCd: '2026-08-23T17:45:00.000Z', tempoOperacaoMin: 549,
        }),
      ]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)

      const wsPlaca = wb.getWorksheet('ABC1234')!
      expect(wsPlaca.getCell(1, 1).value).toContain('RELATÓRIO KPI - NUTRY MAX - PLACA ABC1234')

      const resumo = wsPlaca.getCell(2, 1).value as string
      expect(resumo).toContain('MOTORISTA: JOAO SILVA')
      expect(resumo).toContain('TEMPO OPERAÇÃO: 9h09min')
      expect(resumo).toContain('KM PERCORRIDO: 125.7 km')

      const headerValues = (wsPlaca.getRow(3).values as unknown[]).slice(1)
      expect(headerValues).toEqual([...COLUNAS_DETALHE_PLACA])
    })

    it('uma linha por entrega DESSA placa, na ordem pedida (carga/nf/cliente/endereco/chegada/saida/tempo/status -- achado real 27/08, Tia Erica: motorista/cod/placa/saida-chegada-base ja estao no resumo, tirados daqui)', async () => {
      const linhas: LinhaKpiRomaneio[] = [
        linhaKpi({ carga: 'C001', placa: 'ABC1234' }),
        linhaKpi({ carga: 'C002', placa: 'DEF5678' }),
      ]
      const detalhe: LinhaDetalheEntrega[] = [
        detalheFixture({
          chegada: '2026-08-23T10:00:00.000Z', saida: '2026-08-23T10:15:00.000Z', tempoParadaMin: 15,
          status: 'confirmado_gps',
        }),
        detalheFixture({ clienteCodigo: 'CLI002', nf: 'NF2', clienteNome: 'CLIENTE B', endereco: 'RUA B, 2' }),
        // NF de OUTRA placa -- nao pode vazar pra aba da ABC1234.
        detalheFixture({ carga: 'C002', placa: 'DEF5678', clienteCodigo: 'CLI003', nf: 'NF3', clienteNome: 'CLIENTE C', endereco: 'RUA C, 3' }),
      ]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('ABC1234')!

      const linha1 = (wsPlaca.getRow(4).values as unknown[]).slice(1)
      expect(linha1[0]).toBe('C001') // CARGA
      expect(linha1[1]).toBe('NF1') // NF
      expect(linha1[2]).toBe('CLIENTE A') // CLIENTE
      expect(linha1[3]).toBe('RUA A, 1') // ENDEREÇO
      expect(linha1[4]).toBe('10:00') // CHEGADA NA LOJA (sem shift de fuso, ver formatarHora)
      expect(linha1[5]).toBe('10:15') // SAÍDA DA LOJA (sem shift de fuso, ver formatarHora)
      expect(linha1[6]).toBe('0h15min') // TEMPO NA LOJA
      expect(linha1[7]).toBe('ENTREGUE') // STATUS

      const linha2 = (wsPlaca.getRow(5).values as unknown[]).slice(1)
      expect(linha2[4]).toBe('') // CHEGADA NA LOJA
      expect(linha2[5]).toBe('') // SAÍDA DA LOJA
      expect(linha2[6]).toBe('') // TEMPO NA LOJA
      expect(linha2[7]).toBe('SEM CONFIRMAÇÃO')

      // NF3 (placa DEF5678) não aparece na aba da ABC1234.
      expect(wsPlaca.rowCount).toBe(5)

      const wsOutraPlaca = wb.getWorksheet('DEF5678')!
      const linhaOutra = (wsOutraPlaca.getRow(4).values as unknown[]).slice(1)
      expect(linhaOutra[1]).toBe('NF3')
    })

    it('placa sem nenhuma entrega detalhável ainda ganha aba, só sem linha de dado', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], [])
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('ABC1234')!
      expect(wsPlaca.rowCount).toBe(3) // título + resumo + header, zero linha de dado
    })

    it('autoFilter cobre header + linhas de dado da aba da placa', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
      const detalhe: LinhaDetalheEntrega[] = [detalheFixture()]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('ABC1234')!
      expect(wsPlaca.autoFilter).toBe('A3:H4') // header linha 3, 1 linha de dado, 8 colunas (A..H -- sem resolução manual no dia, RESOLUÇÃO OPERAÇÃO/RESPONSÁVEL não existem)
    })
  })

  describe('aba "SEM PLACA" (fix incidental Task 3 -- romaneio do pão com carga sem placa atribuída no documento, ex. PAO-9/10/12 de 14/09)', () => {
    it('carga com placa vazia não crasha a geração e cai numa aba nomeada "SEM PLACA" (ExcelJS não aceita nome de aba vazio)', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'PAO-9', placa: '' })]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)

      expect(wb.worksheets.map(w => w.name)).toEqual(['KPI 2026-08-23', 'SEM PLACA'])
    })

    it('2+ cargas sem placa (de romaneios diferentes, sem relação nenhuma entre si) caem juntas na mesma aba "SEM PLACA", sem crashar', async () => {
      const linhas: LinhaKpiRomaneio[] = [
        linhaKpi({ carga: 'PAO-9', placa: '', motorista: 'FULANO' }),
        linhaKpi({ carga: 'PAO-10', placa: '', motorista: 'CICLANO' }),
        linhaKpi({ carga: 'PAO-12', placa: '', motorista: 'BELTRANO' }),
      ]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)

      // Uma única aba "SEM PLACA" pras 3 cargas -- não uma por carga (não
      // teriam nome de aba distinto pra usar) e não crasha o addWorksheet.
      expect(wb.worksheets.map(w => w.name)).toEqual(['KPI 2026-08-23', 'SEM PLACA'])
    })

    it('achado 1 (code review): com múltiplas cargas não relacionadas, o resumo NÃO atribui motorista/horário de uma carga específica à aba inteira', async () => {
      const linhas: LinhaKpiRomaneio[] = [
        linhaKpi({
          carga: 'PAO-9', placa: '', motorista: 'FULANO',
          saidaCd: '2026-08-23T08:00:00.000Z', chegadaCd: '2026-08-23T12:00:00.000Z', tempoOperacaoMin: 240, kmPercorrido: 50,
        }),
        linhaKpi({
          carga: 'PAO-10', placa: '', motorista: 'CICLANO',
          saidaCd: '2026-08-23T09:00:00.000Z', chegadaCd: '2026-08-23T18:00:00.000Z', tempoOperacaoMin: 540, kmPercorrido: 200,
        }),
      ]
      const detalhe: LinhaDetalheEntrega[] = [
        detalheFixture({ carga: 'PAO-9', placa: '' }),
        detalheFixture({ carga: 'PAO-10', placa: '', nf: 'NF2' }),
      ]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('SEM PLACA')!

      const resumo = wsPlaca.getCell(2, 1).value as string
      // Nem o motorista/horário de PAO-9 nem de PAO-10 pode aparecer como
      // se fosse "o" resumo da aba -- são cargas sem relação nenhuma.
      expect(resumo).toContain('MOTORISTA: MÚLTIPLOS')
      expect(resumo).not.toContain('FULANO')
      expect(resumo).not.toContain('CICLANO')
      expect(resumo).toContain('SAÍDA CD: -')
      expect(resumo).toContain('CHEGADA CD: -')
      expect(resumo).toContain('TEMPO OPERAÇÃO: -')
      expect(resumo).toContain('KM PERCORRIDO: -')
      // NOTAS continua contando certo (vem de `detalhe`, não do resumo ambíguo).
      expect(resumo).toContain('NOTAS: 2')
    })

    it('com UMA SÓ carga sem placa, o resumo mostra o dado normal dela (não é o caso ambíguo)', async () => {
      const linhas: LinhaKpiRomaneio[] = [
        linhaKpi({ carga: 'PAO-9', placa: '', motorista: 'FULANO', tempoOperacaoMin: 240 }),
      ]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('SEM PLACA')!

      const resumo = wsPlaca.getCell(2, 1).value as string
      expect(resumo).toContain('MOTORISTA: FULANO')
      expect(resumo).not.toContain('MÚLTIPLOS')
    })
  })

  describe('motivoAusencia / observacao (pedido do usuario 25/08: "nada mais no quesito informacoes?" -> nivel Benassi)', () => {
    it('SEM RASTREADOR no lugar de celula vazia quando a placa nunca teve fonte de rastreamento', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234', temRastreador: false })]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const values = (wb.worksheets[0].getRow(LINHA_PRIMEIRO_DADO).values as unknown[]).slice(1)

      expect(values[12]).toBe('SEM CADASTRO') // SAÍDA CD
      expect(values[13]).toBe('SEM CADASTRO') // CHEGADA CD
    })

    it('EM ROTA no lugar de celula vazia quando a data do relatorio e o dia de hoje (rota ainda em andamento)', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234', temRastreador: true })]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-25', [], [], '2026-08-25')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const values = (wb.worksheets[0].getRow(LINHA_PRIMEIRO_DADO).values as unknown[]).slice(1)

      expect(values[12]).toBe('EM ROTA') // SAÍDA CD
      expect(values[13]).toBe('EM ROTA') // CHEGADA CD
    })

    // Bug real 01/10 (RQO1B27, Pao PAO-2): veiculo passou o dia parado fora
    // de qualquer base e so' entrou na base as 17:42 -- a ponte devolve
    // saida null + chegada 17:42 e o xlsx mostrava SAIDA CD "EM ROTA" com
    // CHEGADA CD 17:42. Chegada sem saida nunca aparece (aba 1 + aba da placa).
    it('chegada SEM saida nunca aparece: aba 1 e cabecalho da aba da placa mostram o mesmo motivo da saida', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'PAO-2', placa: 'RQO1B27', saidaCd: null, chegadaCd: '2026-10-01T17:42:35.000Z', kmPercorrido: 20.6 })]
      for (const [hoje, esperado] of [['2026-10-01', 'EM ROTA'], ['2026-10-02', '']] as const) {
        const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-10-01', [], [], hoje)
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(buffer as never)
        const values = (wb.worksheets[0].getRow(LINHA_PRIMEIRO_DADO).values as unknown[]).slice(1)
        expect(values[12]).toBe(esperado) // SAÍDA CD
        expect(values[13]).toBe(esperado) // CHEGADA CD -- nunca '17:42'
        const resumo = wb.getWorksheet('RQO1B27')!.getCell(2, 1).value as string
        expect(resumo).not.toContain('17:42')
        expect(resumo).toContain(`CHEGADA CD: ${esperado || '-'}`)
      }
    })

    it('celula vazia continua vazia (nao inventa motivo) quando ha rastreador e a data ja passou', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234', temRastreador: true })]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], [], '2026-08-25')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const values = (wb.worksheets[0].getRow(LINHA_PRIMEIRO_DADO).values as unknown[]).slice(1)

      expect(values[12]).toBe('') // SAÍDA CD
      expect(values[13]).toBe('') // CHEGADA CD
    })

    // Achado real 15/09 (grupo KPI AJUSTES): NF que já recebeu veredito
    // final (não é mais "espera", é uma acusação/observação concreta) num
    // relatório de HOJE mostrava "EM ROTA" na célula de horário -- placa já
    // tinha voltado pra base, mas `data === hoje` sozinho não distinguia
    // isso de uma linha genuinamente ainda em andamento. Contradição visível
    // no relatório: STATUS diz "CONFERIR" (veredito), horário diz "em rota"
    // (espera).
    it('NF com veredito final (nao AGUARDANDO) num relatorio de hoje: NAO mostra EM ROTA, mesmo com placa ja tendo voltado', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234', temRastreador: true })]
      const detalhe: LinhaDetalheEntrega[] = [detalheFixture({
        temRastreador: true, status: 'pendente', chegada: null, saida: null,
        observacao: 'PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR',
      })]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-25', [], detalhe, '2026-08-25')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('ABC1234')!
      const values = (wsPlaca.getRow(4).values as unknown[]).slice(1)

      expect(values[4]).toBe('') // CHEGADA NA LOJA -- nao "EM ROTA"
      expect(values[5]).toBe('') // SAÍDA DA LOJA -- nao "EM ROTA"
    })

    it('NF genuinamente sem veredito (AGUARDANDO) num relatorio de hoje: mostra EM ROTA normalmente', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234', temRastreador: true })]
      const detalhe: LinhaDetalheEntrega[] = [detalheFixture({
        temRastreador: true, status: 'pendente', chegada: null, saida: null,
        observacao: 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO',
      })]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-25', [], detalhe, '2026-08-25')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('ABC1234')!
      const values = (wsPlaca.getRow(4).values as unknown[]).slice(1)

      expect(values[4]).toBe('EM ROTA') // CHEGADA NA LOJA
      expect(values[5]).toBe('EM ROTA') // SAÍDA DA LOJA
    })

    it('SEM RASTREADOR tambem aparece na aba por placa (CHEGADA/SAÍDA NA LOJA de NF pendente)', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234', temRastreador: false })]
      const detalhe: LinhaDetalheEntrega[] = [detalheFixture({ temRastreador: false, saidaCd: null, chegadaCd: null })]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('ABC1234')!
      const values = (wsPlaca.getRow(4).values as unknown[]).slice(1)

      expect(values[4]).toBe('SEM CADASTRO') // CHEGADA NA LOJA
      expect(values[5]).toBe('SEM CADASTRO') // SAÍDA DA LOJA
    })

    it('NF confirmada via Unitrac (sem GPS) nunca ganha motivo em CHEGADA/SAÍDA NA LOJA, mesmo sem rastreador -- ja tem explicacao propria via STATUS', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
      const detalhe: LinhaDetalheEntrega[] = [detalheFixture({ temRastreador: false, status: 'confirmado_unitrac' })]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('ABC1234')!
      const values = (wsPlaca.getRow(4).values as unknown[]).slice(1)

      expect(values[4]).toBe('') // CHEGADA NA LOJA
      expect(values[5]).toBe('') // SAÍDA NA LOJA
      expect(values[7]).toBe('ENTREGUE') // STATUS
    })

    it('observacao presente SUBSTITUI o texto de STATUS (mais informativa que o rotulo generico)', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
      const detalhe: LinhaDetalheEntrega[] = [
        detalheFixture({ observacao: 'MUDOU DE ROTA - CONFERIR (placa provável: RQV6I51)' }),
      ]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('ABC1234')!
      const values = (wsPlaca.getRow(4).values as unknown[]).slice(1)

      expect(values[7]).toBe('MUDOU DE ROTA - CONFERIR (placa provável: RQV6I51)')
    })
  })

  describe('resumo de confirmacao do dia (Task 1, 24/09: SEM RASTREADOR sai do numerador E do denominador da taxa)', () => {
    it('10 NFs, 8 confirmadas, 2 sem rastreador: taxa = 8/8 = 100%, com "NFs sem rastreador: 2" a parte', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
      const confirmadas = Array.from({ length: 8 }, (_, i) =>
        detalheFixture({ nf: `NF${i + 1}`, status: 'confirmado_gps' }))
      const semRastreador = Array.from({ length: 2 }, (_, i) =>
        detalheFixture({
          nf: `NFX${i + 1}`, status: 'pendente', temRastreador: false,
          observacao: 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO',
        }))
      const detalhe: LinhaDetalheEntrega[] = [...confirmadas, ...semRastreador]

      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const ws = wb.worksheets[0]
      const resumoTexto = ws.getRow(ws.rowCount).getCell(1).value as string

      expect(resumoTexto).toContain('100,0% (8 de 8 NFs; 2 sem rastreador fora da conta)')
      expect(resumoTexto).toContain('NFs sem rastreador: 2')
    })

    it('NFs VEÍCULO NÃO SAIU DA BASE ficam fora da taxa (num e denom), contadas a parte', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
      const confirmadas = Array.from({ length: 3 }, (_, i) => detalheFixture({ nf: `NF${i + 1}`, status: 'confirmado_gps' }))
      const pend = detalheFixture({ nf: 'NFP', status: 'pendente' })
      const naoSaiu = Array.from({ length: 2 }, (_, i) => detalheFixture({
        nf: `NFB${i + 1}`, status: 'pendente', observacao: 'VEÍCULO NÃO SAIU DA BASE',
        evidencia: 'nao_saiu_da_base', confianca: 'SEM BASE',
      }))
      const semRastr = detalheFixture({
        nf: 'NFR', status: 'pendente', temRastreador: false,
        observacao: 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO',
      })
      const detalhe = [...confirmadas, pend, ...naoSaiu, semRastr]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const ws = wb.worksheets[0]
      const t = ws.getRow(ws.rowCount).getCell(1).value as string
      expect(t).toContain('75,0% (3 de 4 NFs; 1 sem rastreador e 2 que não saíram da base fora da conta)')
      expect(t).toContain('NFs sem saída da base: 2 (fora da conta)')
      expect(t).toContain('NFs sem rastreador: 1')
      // pos-conferencia: sem resolucao fica fora; com resolucao conta pela resolucao
      expect(t).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 75,0% (3 de 4 NFs; 3 fora da conta)')
    })

    it('NF NÃO SAIU DA BASE com resolucao manual entra pos-conferencia pela resolucao', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
      const detalhe = [
        detalheFixture({ nf: 'NF1', status: 'confirmado_gps' }),
        detalheFixture({
          nf: 'NFB', status: 'pendente', observacao: 'VEÍCULO NÃO SAIU DA BASE', evidencia: 'nao_saiu_da_base',
          confianca: 'SEM BASE', resolucaoManual: 'entregue', responsavelResolucao: 'ANA',
        }),
      ]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const ws = wb.worksheets[0]
      const t = ws.getRow(ws.rowCount).getCell(1).value as string
      expect(t).toContain('100,0% (1 de 1 NFs;')
      expect(t).toContain('APÓS CONFERÊNCIA DA OPERAÇÃO: 100,0% (2 de 2 NFs; 0 fora da conta)')
    })

    it('sem nenhuma NF sem rastreador: denominador = total, "NFs sem rastreador: 0"', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
      const detalhe: LinhaDetalheEntrega[] = Array.from({ length: 4 }, (_, i) =>
        detalheFixture({ nf: `NF${i + 1}`, status: i < 2 ? 'confirmado_gps' : 'pendente' }))

      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const ws = wb.worksheets[0]
      const resumoTexto = ws.getRow(ws.rowCount).getCell(1).value as string

      expect(resumoTexto).toContain('50,0% (2 de 4 NFs; 0 sem rastreador fora da conta)') // 2 confirmadas / 4 total
      expect(resumoTexto).toContain('NFs sem rastreador: 0')
    })
  })

  describe('resolução manual por NF (Task 4, 24/09) + RESOLUÇÃO OPERAÇÃO/RESPONSÁVEL condicionais (ajuste 26/09: layout volta a STATUS, colunas só existem com resolução no dia)', () => {
    // TDD do ajuste 26/09: cabeçalho tem EXATAMENTE 8 colunas quando nenhuma
    // NF do dia tem resolução manual -- RESOLUÇÃO OPERAÇÃO/RESPONSÁVEL nem
    // existem (não é célula vazia, é a coluna toda ausente).
    it('sem nenhuma resolução manual no dia: header sai com as 8 colunas exatas de COLUNAS_DETALHE_PLACA (STATUS, não STATUS AUTOMÁTICO)', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], [detalheFixture()])
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('ABC1234')!
      const headerValues = (wsPlaca.getRow(3).values as unknown[]).slice(1)
      expect(headerValues).toHaveLength(8)
      expect(headerValues).toEqual([...COLUNAS_DETALHE_PLACA])
      expect(headerValues).toContain('STATUS')
      expect(headerValues).not.toContain('STATUS AUTOMÁTICO')
      expect(headerValues).not.toContain('RESOLUÇÃO OPERAÇÃO')
      expect(headerValues).not.toContain('RESPONSÁVEL')
    })

    // TDD do ajuste 26/09: com PELO MENOS uma resolução manual no dia, as
    // duas colunas aparecem no fim -- 10 colunas ao todo.
    it('com pelo menos uma resolução manual no dia: header ganha RESOLUÇÃO OPERAÇÃO e RESPONSÁVEL no fim (10 colunas)', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
      const detalhe = [detalheFixture({ resolucaoManual: 'entregue', responsavelResolucao: 'ANA' })]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('ABC1234')!
      const headerValues = (wsPlaca.getRow(3).values as unknown[]).slice(1)
      expect(headerValues).toHaveLength(10)
      expect(headerValues).toEqual([...COLUNAS_DETALHE_PLACA, ...COLUNAS_RESOLUCAO])
    })

    it('resolução manual em UMA placa liga as colunas em TODAS as abas do dia (mesmo header em qualquer placa)', async () => {
      const linhas: LinhaKpiRomaneio[] = [
        linhaKpi({ carga: 'C001', placa: 'ABC1234' }),
        linhaKpi({ carga: 'C002', placa: 'DEF5678' }),
      ]
      const detalhe: LinhaDetalheEntrega[] = [
        detalheFixture({ resolucaoManual: 'entregue', responsavelResolucao: 'ANA' }),
        detalheFixture({ carga: 'C002', placa: 'DEF5678', nf: 'NF2' }),
      ]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsOutraPlaca = wb.getWorksheet('DEF5678')!
      const headerValues = (wsOutraPlaca.getRow(3).values as unknown[]).slice(1)
      expect(headerValues).toEqual([...COLUNAS_DETALHE_PLACA, ...COLUNAS_RESOLUCAO])
      // linha dessa placa sem resolução própria fica com as células vazias
      const linha = (wsOutraPlaca.getRow(4).values as unknown[]).slice(1)
      expect(linha[8] ?? '').toBe('')
      expect(linha[9] ?? '').toBe('')
    })

    it('NF sem resolução manual (mas outra NF do dia tem): colunas ficam vazias, STATUS igual antes', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
      const detalhe: LinhaDetalheEntrega[] = [
        detalheFixture({ nf: 'NF1', status: 'confirmado_gps' }),
        detalheFixture({ nf: 'NF2', resolucaoManual: 'entregue', responsavelResolucao: 'ANA' }),
      ]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('ABC1234')!
      const linha1 = (wsPlaca.getRow(4).values as unknown[]).slice(1)
      expect(linha1[7]).toBe('ENTREGUE') // STATUS intacto
      expect(linha1[8]).toBe('') // RESOLUÇÃO OPERAÇÃO
      expect(linha1[9]).toBe('') // RESPONSÁVEL
    })

    it('NF com resolução manual "entregue_outra_placa": mostra a placa executora ao lado + responsável, sem mudar o STATUS pendente', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'RQU5J45' })]
      const detalhe = [detalheFixture({
        placa: 'RQU5J45', status: 'pendente', observacao: null,
        resolucaoManual: 'entregue_outra_placa', placaExecutoraResolucao: 'TUS1B06', responsavelResolucao: 'ANA',
      })]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.getWorksheet('RQU5J45')!
      const linha1 = (wsPlaca.getRow(4).values as unknown[]).slice(1)
      expect(linha1[7]).toBe('SEM CONFIRMAÇÃO') // automático original preservado
      expect(linha1[8]).toBe('ENTREGUE POR OUTRA PLACA (TUS1B06)')
      expect(linha1[9]).toBe('ANA')
    })

    it('resumo do dia mostra as duas taxas -- automática (sem contar resolução manual) e "após conferência da operação" (conta as confirmatórias)', async () => {
      const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
      const detalhe: LinhaDetalheEntrega[] = [
        detalheFixture({ nf: 'NF1', status: 'pendente', resolucaoManual: 'entregue', responsavelResolucao: 'ANA' }),
        detalheFixture({ nf: 'NF2', status: 'pendente', resolucaoManual: 'nao_esteve_no_local', responsavelResolucao: 'ANA' }),
        detalheFixture({ nf: 'NF3', status: 'confirmado_gps' }),
        detalheFixture({ nf: 'NF4', status: 'pendente' }),
      ]
      const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const ws = wb.worksheets[0]
      const resumoTexto = ws.getRow(ws.rowCount).getCell(1).value as string

      // Automatica: so' NF3 confirma de verdade -> 1/4 = 25%. Nunca soma a
      // resolucao manual no automatico (Global Constraint do plano).
      expect(resumoTexto).toContain('TAXA DE CONFIRMAÇÃO: 25,0% (1 de 4 NFs; 0 sem rastreador fora da conta)')
      // Apos conferencia: NF1 (entregue manual) + NF3 (automatico) confirmam,
      // NF2 (nao esteve no local) NAO conta mesmo resolvida -> 2/4 = 50%.
      expect(resumoTexto).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 50,0% (2 de 4 NFs; 0 fora da conta)')
    })

    // Fix round 1, item 4: decisao de negocio da Ana -- SEM RASTREADOR fica
    // "aguardando confirmação operacional" na taxa apos conferencia; quando
    // essa confirmacao chega (qualquer resolucao manual exceto
    // 'desatualizado'), a NF ENTRA no denominador e conta conforme a
    // resolucao. A taxa automatica continua excluindo SEM RASTREADOR sempre
    // (nao mudou).
    describe('SEM RASTREADOR + resolução manual (Fix round 1, item 4a) e "desatualizado" (item 4b)', () => {
      it('SEM RASTREADOR com resolução manual confirmatória: entra no denominador da taxa após conferência e conta como confirmada', async () => {
        const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
        const detalhe: LinhaDetalheEntrega[] = [
          detalheFixture({
            nf: 'NF1', status: 'pendente', temRastreador: false,
            observacao: 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO',
            resolucaoManual: 'entregue', responsavelResolucao: 'ANA',
          }),
          detalheFixture({ nf: 'NF2', status: 'confirmado_gps' }),
        ]
        const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(buffer)
        const ws = wb.worksheets[0]
        const resumoTexto = ws.getRow(ws.rowCount).getCell(1).value as string

        // Automatica: NF1 sai do denominador (sem rastreador, sem confirmação
        // automática possível) -> 1/1 = 100%, comportamento antigo intacto.
        expect(resumoTexto).toContain('TAXA DE CONFIRMAÇÃO: 100,0% (1 de 1 NFs; 1 sem rastreador fora da conta)')
        // Apos conferencia: NF1 ENTRA (resolução manual confirmatória) e
        // conta como confirmada + NF2 confirma -> 2/2 = 100%.
        expect(resumoTexto).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 100,0% (2 de 2 NFs; 0 fora da conta)')
      })

      it('SEM RASTREADOR com resolução manual "não esteve no local": entra no denominador mas NÃO conta como confirmada', async () => {
        const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
        const detalhe: LinhaDetalheEntrega[] = [
          detalheFixture({
            nf: 'NF1', status: 'pendente', temRastreador: false,
            observacao: 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO',
            resolucaoManual: 'nao_esteve_no_local', responsavelResolucao: 'ANA',
          }),
          detalheFixture({ nf: 'NF2', status: 'confirmado_gps' }),
        ]
        const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(buffer)
        const ws = wb.worksheets[0]
        const resumoTexto = ws.getRow(ws.rowCount).getCell(1).value as string

        expect(resumoTexto).toContain('TAXA DE CONFIRMAÇÃO: 100,0% (1 de 1 NFs; 1 sem rastreador fora da conta)') // automatica intacta
        // Apos conferencia: NF1 entra no denominador (tem resolucao manual,
        // não é 'desatualizado') mas não confirma -> 1/2 = 50%.
        expect(resumoTexto).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 50,0% (1 de 2 NFs; 0 fora da conta)')
      })

      it('SEM RASTREADOR SEM nenhuma resolução manual: continua fora do denominador da taxa após conferência (aguardando confirmação operacional)', async () => {
        const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
        const detalhe: LinhaDetalheEntrega[] = [
          detalheFixture({
            nf: 'NF1', status: 'pendente', temRastreador: false,
            observacao: 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO',
          }),
          detalheFixture({ nf: 'NF2', status: 'confirmado_gps' }),
        ]
        const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(buffer)
        const ws = wb.worksheets[0]
        const resumoTexto = ws.getRow(ws.rowCount).getCell(1).value as string

        expect(resumoTexto).toContain('TAXA DE CONFIRMAÇÃO: 100,0% (1 de 1 NFs; 1 sem rastreador fora da conta)')
        // NF1 continua fora do denominador da taxa apos conferencia tambem
        // (sem confirmacao operacional ainda) -> 1/1 = 100% (so' NF2 conta).
        expect(resumoTexto).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 100,0% (1 de 1 NFs; 1 fora da conta)')
      })

      it('"desatualizado" (NF com rastreador normal) sai do denominador da taxa após conferência -- fica pendente de atualização, não conta como falha', async () => {
        const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
        const detalhe: LinhaDetalheEntrega[] = [
          detalheFixture({ nf: 'NF1', status: 'pendente', resolucaoManual: 'desatualizado', responsavelResolucao: 'ANA' }),
          detalheFixture({ nf: 'NF2', status: 'confirmado_gps' }),
        ]
        const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(buffer)
        const ws = wb.worksheets[0]
        const resumoTexto = ws.getRow(ws.rowCount).getCell(1).value as string

        // Automatica: NF1 nao e' sem rastreador, entra normal no denominador
        // -> 1 confirmada (NF2) / 2 = 50%. Automatica NUNCA muda com Fix
        // round 1.
        expect(resumoTexto).toContain('TAXA DE CONFIRMAÇÃO: 50,0% (1 de 2 NFs; 0 sem rastreador fora da conta)')
        // Apos conferencia: NF1 sai do denominador (desatualizado) -> so'
        // NF2 conta -> 1/1 = 100%.
        expect(resumoTexto).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 100,0% (1 de 1 NFs; 1 fora da conta)')
      })

      it('"desatualizado" + SEM RASTREADOR: sai do denominador (dupla exclusão continua sendo so exclusão)', async () => {
        const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
        const detalhe: LinhaDetalheEntrega[] = [
          detalheFixture({
            nf: 'NF1', status: 'pendente', temRastreador: false,
            observacao: 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO',
            resolucaoManual: 'desatualizado', responsavelResolucao: 'ANA',
          }),
          detalheFixture({ nf: 'NF2', status: 'confirmado_gps' }),
        ]
        const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(buffer)
        const ws = wb.worksheets[0]
        const resumoTexto = ws.getRow(ws.rowCount).getCell(1).value as string

        expect(resumoTexto).toContain('TAXA DE CONFIRMAÇÃO: 100,0% (1 de 1 NFs; 1 sem rastreador fora da conta)')
        expect(resumoTexto).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 100,0% (1 de 1 NFs; 1 fora da conta)')
      })
    })
  })

  // Revisao final pre-deploy (24/09): a linha de resumo (TAXA DE CONFIRMAÇÃO /
  // NFs sem rastreador) e' da Nutry Max -- o Rio Quality (pipeline.ts) nao a
  // tinha em 108b4bb e nao deve ganhar sem decisao. Opt-in via opcoes.
  describe('resumo de confirmacao -- opt-in e regras finais (revisao final 24/09, itens 1, 2 e 4)', () => {
    async function textosDaAbaPrincipal(buffer: Buffer): Promise<string[]> {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const ws = wb.worksheets[0]
      const out: string[] = []
      ws.eachRow(r => r.eachCell(c => { if (typeof c.value === 'string') out.push(c.value) }))
      return out
    }
    async function resumo(detalhe: LinhaDetalheEntrega[]): Promise<string> {
      const buffer = await gerarKpiRomaneioXlsx([linhaKpi()], '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const ws = wb.worksheets[0]
      return ws.getRow(ws.rowCount).getCell(1).value as string
    }

    it('item 1: sem a opcao (chamada do Rio Quality) nao escreve linha de TAXA DE CONFIRMAÇÃO nem "NFs sem rastreador"', async () => {
      const detalhe = [detalheFixture({ status: 'confirmado_gps' }), detalheFixture({ nf: 'NF2', temRastreador: false })]
      const buffer = await gerarKpiRomaneioXlsx([linhaKpi()], '2026-08-23', [], detalhe, undefined, 'RIO QUALITY')
      const textos = await textosDaAbaPrincipal(buffer)
      expect(textos.some(t => t.includes('TAXA DE CONFIRMAÇÃO'))).toBe(false)
      expect(textos.some(t => t.includes('NFs sem rastreador'))).toBe(false)
    })

    it('item 2: placa temRastreador=false -> TODAS as NFs dela saem do denominador automatico (inclusive confirmado_unitrac), exceto confirmadas por outra placa', async () => {
      const detalhe: LinhaDetalheEntrega[] = [
        detalheFixture({ nf: 'NF1', status: 'confirmado_gps', evidencia: 'parada_no_endereco' }),
        detalheFixture({ nf: 'NF2', status: 'pendente' }),
        // placa sem rastreador:
        detalheFixture({ nf: 'NF3', placa: 'TTL5J17', temRastreador: false, status: 'pendente',
          observacao: 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO', evidencia: 'sem_rastreador' }),
        detalheFixture({ nf: 'NF4', placa: 'TTL5J17', temRastreador: false, status: 'confirmado_unitrac', evidencia: 'alvo_feito_unitrac' }),
        detalheFixture({ nf: 'NF5', placa: 'TTL5J17', temRastreador: false, status: 'confirmado_gps', evidencia: 'outra_placa',
          observacao: 'ENTREGUE POR OUTRA PLACA (RQV6I51) - CARGA TRANSFERIDA' }),
      ]
      const texto = await resumo(detalhe)
      // denominador = NF1, NF2, NF5 -> confirmadas NF1, NF5 -> 2/3 = 66,7%
      expect(texto).toContain('TAXA DE CONFIRMAÇÃO: 66,7% (2 de 3 NFs; 2 sem rastreador fora da conta)')
      expect(texto).toContain('NFs sem rastreador: 2')
    })

    it('item 4: AGUARDANDO (dia em andamento) sai do denominador das duas taxas e aparece contado a parte', async () => {
      const AG = 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO'
      const detalhe: LinhaDetalheEntrega[] = [
        detalheFixture({ nf: 'NF1', status: 'confirmado_gps' }),
        detalheFixture({ nf: 'NF2', status: 'confirmado_gps' }),
        detalheFixture({ nf: 'NF3', status: 'pendente' }),
        detalheFixture({ nf: 'NF4', status: 'pendente', observacao: AG }),
        detalheFixture({ nf: 'NF5', status: 'pendente', observacao: AG }),
      ]
      const texto = await resumo(detalhe)
      // 2/3 nas duas taxas (NF4, NF5 fora)
      expect(texto).toContain('TAXA DE CONFIRMAÇÃO: 66,7% (2 de 3 NFs; 0 sem rastreador fora da conta)')
      expect(texto).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 66,7% (2 de 3 NFs; 2 fora da conta)')
      expect(texto).toContain('NFs aguardando fim da rota: 2')
    })

    it('item 4: AGUARDANDO com resolucao manual confirmatoria entra na taxa apos conferencia (palavra da operacao), mas nunca na automatica', async () => {
      const detalhe: LinhaDetalheEntrega[] = [
        detalheFixture({ nf: 'NF1', status: 'confirmado_gps' }),
        detalheFixture({ nf: 'NF2', status: 'pendente', observacao: 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO',
          resolucaoManual: 'entregue', responsavelResolucao: 'ANA' }),
      ]
      const texto = await resumo(detalhe)
      expect(texto).toContain('TAXA DE CONFIRMAÇÃO: 100,0% (1 de 1 NFs; 0 sem rastreador fora da conta)') // 1/1
      expect(texto).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 100,0% (2 de 2 NFs; 0 fora da conta)') // 2/2
      expect(texto).toContain('NFs aguardando fim da rota: 1')
    })

    // Task 1 (plano 2026-09-26, modoPrecisao): REVISAR (proximidade fraca)
    // sai pendente -- fica no denominador, nunca no numerador da taxa
    // automatica; aparece contado a parte. A resolucao manual da operacao
    // pode confirma-lo na taxa apos conferencia.
    it('Task 1: REVISAR fica fora do numerador da taxa automatica, contado a parte, e a resolucao manual confirma na pos-conferencia', async () => {
      const detalhe: LinhaDetalheEntrega[] = [
        detalheFixture({ nf: 'NF1', status: 'confirmado_gps' }),
        detalheFixture({ nf: 'NF2', status: 'pendente', observacao: 'PARADA PRÓXIMA (300-800m) - REVISAR', evidencia: 'raio_ampliado', confianca: 'REVISAR' }),
        detalheFixture({ nf: 'NF3', status: 'pendente', observacao: 'PARADA CURTA - REVISAR', evidencia: 'parada_curta_compartilhada', confianca: 'REVISAR',
          resolucaoManual: 'entregue', responsavelResolucao: 'ANA' }),
        detalheFixture({ nf: 'NF4', status: 'pendente', observacao: 'PARADA COMPARTILHADA - REVISAR', evidencia: 'vizinhanca', confianca: 'REVISAR' }),
        detalheFixture({ nf: 'NF5', status: 'pendente', observacao: 'PARADA PRÓXIMA (100-300m) - REVISAR', evidencia: 'parada_unitrac_propria', confianca: 'REVISAR' }),
      ]
      const texto = await resumo(detalhe)
      expect(texto).toContain('TAXA DE CONFIRMAÇÃO: 20,0% (1 de 5 NFs; 0 sem rastreador fora da conta)') // 1/5
      expect(texto).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 40,0% (2 de 5 NFs; 0 fora da conta)') // NF1 + NF3 (manual)
      expect(texto).toContain('REVISAR: 4')
    })

    it('Task 1: REVISAR aparece mesmo zerado (linha sempre presente no resumo)', async () => {
      const texto = await resumo([detalheFixture({ nf: 'NF1', status: 'confirmado_gps' })])
      expect(texto).toContain('REVISAR: 0')
    })

    it('Task 1: REVISAR mostra o horario da parada no detalhe da placa (informacao util, nao conta como entregue)', async () => {
      const detalhe: LinhaDetalheEntrega[] = [
        detalheFixture({ nf: 'NF1', status: 'pendente', observacao: 'PARADA PRÓXIMA (300-800m) - REVISAR', evidencia: 'raio_ampliado',
          chegada: '2026-08-23T10:00:00.000Z', saida: '2026-08-23T10:20:00.000Z', tempoParadaMin: 20 }),
      ]
      const buffer = await gerarKpiRomaneioXlsx([linhaKpi()], '2026-08-23', [], detalhe, '2026-09-26', undefined, { resumoConfirmacao: true })
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const wsPlaca = wb.worksheets[1]
      const valores = (wsPlaca.getRow(4).values as unknown[]).slice(1)
      expect(valores[4]).toBe('10:00')
      expect(valores[5]).toBe('10:20')
      expect(valores[7]).toBe('PARADA PRÓXIMA (300-800m) - REVISAR')
    })

    // Item 2 (revisao final 26/09; ajuste 26/09: REVISAR sempre conta por
    // d.confianca, `opcoes.motivoConfianca` removida junto com a coluna
    // CONFIANÇA) -- cobre tanto o sufixo "- REVISAR" quanto outros rotulos
    // pendente com CONFERIR (ex. "PARADA PRÓXIMA (500m-2km) MAS FORA DO
    // ENDEREÇO - CONFERIR") que calcularConfianca ja classifica como REVISAR.
    it('REVISAR conta pelo d.confianca, cobrindo tanto o sufixo "- REVISAR" quanto CONFERIR', async () => {
      const detalhe: LinhaDetalheEntrega[] = [
        detalheFixture({ nf: 'NF1', status: 'confirmado_gps', confianca: 'CONFIRMADA' }),
        detalheFixture({ nf: 'NF2', status: 'pendente', observacao: 'PARADA PRÓXIMA (300-800m) - REVISAR', evidencia: 'raio_ampliado', confianca: 'REVISAR' }),
        detalheFixture({ nf: 'NF3', status: 'pendente', observacao: 'PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR', evidencia: 'parada_proxima_fora_raio', confianca: 'REVISAR' }),
      ]
      const texto = await resumo(detalhe)
      expect(texto).toContain('REVISAR: 2')
    })
  })
})

// Ajuste de layout (pedido do usuario, 26/09): PLACA EXECUTORA, MOTIVO e
// CONFIANÇA saem do xlsx pros dois clientes -- as opcoes `placaExecutora`/
// `motivoConfianca` (Task 2/3, plano 26/09) foram removidas do gerador
// inteiro (sem deixar opcao morta), entao esta rota confirma que o rodizio
// (NF de "ROTA EXECUTADA POR OUTRA PLACA") continua sendo contado como
// confirmado na taxa mesmo sem nenhuma coluna dedicada -- so' a taxa
// (calculada em cima de `status`, nunca das colunas de exibicao) precisa
// continuar certa.
describe('gerador-xlsx -- rodizio sem coluna dedicada (ajuste 26/09: PLACA EXECUTORA removida)', () => {
  it('NF de rodizio (status confirmado) conta na taxa e mostra STATUS comecando com ENTREGUE mesmo com observacao residual "ROTA EXECUTADA POR OUTRA PLACA"; xlsx nao tem PLACA EXECUTORA/MOTIVO/CONFIANÇA', async () => {
    const linhas = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
    const detalhe: LinhaDetalheEntrega[] = [
      detalheFixture({
        nf: 'NF1', status: 'confirmado_gps', observacao: 'ROTA EXECUTADA POR OUTRA PLACA (TOS1H26)',
        evidencia: 'rota_outra_placa', distParadaM: 25, placaExecutora: 'TOS1H26',
        chegada: '2026-08-23T10:00:00.000Z', saida: '2026-08-23T10:10:00.000Z', tempoParadaMin: 10,
      }),
      detalheFixture({ nf: 'NF2', observacao: 'PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA' }),
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const wsPlaca = wb.getWorksheet('ABC1234')!
    const header = (wsPlaca.getRow(3).values as unknown[]).slice(1)
    expect(header).toEqual([...COLUNAS_DETALHE_PLACA])
    expect(header).not.toContain('PLACA EXECUTORA')
    expect(header).not.toContain('MOTIVO')
    expect(header).not.toContain('CONFIANÇA')
    const l1 = (wsPlaca.getRow(4).values as unknown[]).slice(1)
    // Bug real 26/09 (segunda rodada): STATUS de uma NF confirmada tem que
    // COMEÇAR com "ENTREGUE", sem exceção -- observacao residual vira
    // sufixo, nunca esconde a confirmação.
    expect(l1[7]).toBe('ENTREGUE - ROTA EXECUTADA POR OUTRA PLACA (TOS1H26)')
    expect((l1[7] as string).startsWith('ENTREGUE')).toBe(true)
    const resumoTexto = String(wb.worksheets[0].getCell(4, 1).value)
    // NF solta com placa da escala divergente numa carga que rodou continua
    // na taxa (so' a carga inteira divergente sai -- medicao 25/09).
    expect(resumoTexto).toContain('TAXA DE CONFIRMAÇÃO: 50,0% (1 de 2 NFs; 0 sem rastreador fora da conta)')
  })

  it('carga em que a placa da escala nao passou em NENHUM cliente sai da taxa, contada a parte (RQO1B27 01/10)', async () => {
    const linhas = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
    const detalhe: LinhaDetalheEntrega[] = [
      detalheFixture({ nf: 'NF1', carga: 'C001', placa: 'ABC1234', status: 'confirmado_gps', observacao: null }),
      detalheFixture({ nf: 'NF2', carga: 'C002', placa: 'RQO1B27', observacao: 'PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA' }),
      detalheFixture({ nf: 'NF3', carga: 'C002', placa: 'RQO1B27', observacao: 'PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA' }),
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-10-01', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const resumoTexto = String(wb.worksheets[0].getCell(4, 1).value)
    expect(resumoTexto).toContain('TAXA DE CONFIRMAÇÃO: 100,0% (1 de 1 NFs; 0 sem rastreador e 2 de placa da escala divergente fora da conta)')
    expect(resumoTexto).toContain('NFs com placa da escala divergente: 2 (fora da conta)')
  })

  it('aba Avisos lista por placa as NFs fora da taxa por falta de rastreador e por placa da escala divergente (pedido Ana 03/10)', async () => {
    const linhas = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
    const detalhe: LinhaDetalheEntrega[] = [
      detalheFixture({ nf: 'NF1', carga: '99261', placa: 'LLD4202', temRastreador: false, observacao: 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO' }),
      detalheFixture({ nf: 'NF2', carga: '99261', placa: 'LLD4202', temRastreador: false, observacao: 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO' }),
      detalheFixture({ nf: 'NF4', carga: '99300', placa: 'TTL5J17', temRastreador: true, observacao: 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO' }),
      detalheFixture({ nf: 'NF3', carga: '99100', placa: 'RQO1B27', observacao: 'PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA' }),
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-10-02', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.getWorksheet('Avisos')!
    const textos = [2, 3, 4].map(r => (ws.getRow(r).values as unknown[]).slice(1).join(' | '))
    expect(textos).toEqual([
      '99100 | RQO1B27 | placa da escala não passou nos clientes -- 1 NF(s) fora da taxa (substituição de veículo não informada?)',
      '99261 | LLD4202 | placa não cadastrada na frota rastreada (placa provisória ou veículo novo?) -- 2 NF(s) fora da taxa (informar a placa real que fez a carga)',
      '99300 | TTL5J17 | veículo sem rastreamento no dia -- 1 NF(s) fora da taxa (conferir equipamento/placa da escala)',
    ])
  })

  it('aba Auditoria tem uma linha por NF com status final e regra/evidencia (pedido Ana 03/10)', async () => {
    const linhas = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
    const detalhe: LinhaDetalheEntrega[] = [
      detalheFixture({ nf: 'NF1', status: 'confirmado_gps', observacao: null, motivo: 'Parada de 5 min a 40 m do cadastro Unitrac', distParadaM: 40, tempoParadaMin: 5 }),
      detalheFixture({ nf: 'NF2', observacao: 'PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR', motivo: 'Passou no endereço sem parar' }),
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-10-02', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.getWorksheet('Auditoria')!
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(['CARGA', 'PLACA', 'NF', 'CLIENTE', 'STATUS ORIGINAL (KPI)', 'REGRA / EVIDÊNCIA', 'DISTÂNCIA DA PARADA (m)', 'TEMPO PARADO', 'STATUS FINAL (APÓS CONFERÊNCIA)'])
    expect(ws.rowCount).toBe(3)
    expect(String(ws.getRow(2).getCell(6).value)).toBe('Parada de 5 min a 40 m do cadastro Unitrac')
    expect(ws.getRow(2).getCell(7).value).toBe(40)
    expect(String(ws.getRow(2).getCell(9).value)).toBe(String(ws.getRow(2).getCell(5).value))
  })

  it('placa da escala divergente com resolucao manual volta pra taxa apos conferencia', async () => {
    const linhas = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
    const detalhe: LinhaDetalheEntrega[] = [
      detalheFixture({ nf: 'NF1', carga: 'C001', placa: 'ABC1234', status: 'confirmado_gps', observacao: null }),
      detalheFixture({ nf: 'NF2', carga: 'C002', placa: 'RQO1B27', observacao: 'PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA', resolucaoManual: 'nao_esteve_no_local' }),
    ]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, undefined, { resumoConfirmacao: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const resumoTexto = String(wb.worksheets[0].getCell(4, 1).value)
    expect(resumoTexto).toContain('TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 50,0% (1 de 2 NFs; 0 fora da conta)')
    expect(resumoTexto).toContain('ENTREGUE: 1 / PENDENTE DE AUDITORIA: 0 / NÃO ENTREGUE CONFIRMADO: 1')
  })

  it('mesmo cabeçalho pro Rio Quality (pipeline.ts, sem nenhuma opção)', async () => {
    const linhas = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
    const detalhe: LinhaDetalheEntrega[] = [detalheFixture({ nf: 'NF1' })]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe, undefined, 'RIO QUALITY')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const wsPlaca = wb.getWorksheet('ABC1234')!
    const header = (wsPlaca.getRow(3).values as unknown[]).slice(1)
    expect(header).toEqual([...COLUNAS_DETALHE_PLACA])
  })
})

// Bug real 26/09 (segunda rodada, achado da Ana no KPI-Nutry-Max-2026-09-25-
// TESTE.xlsx): resumo (2.079) != soma de linhas com STATUS iniciando em
// "ENTREGUE" nas abas (2.073) porque `textoStatus` mostrava a observacao
// residual (ex. "TEMPO EM LOJA ACIMA DE 4H - CONFERIR") POR CIMA de um
// status ja' confirmado -- trava agora exigida: toda NF confirmada
// (status !== 'pendente') tem STATUS comecando com "ENTREGUE", sem excecao.
describe('gerador-xlsx -- STATUS de NF confirmada sempre comeca com ENTREGUE (bug real 26/09, segunda rodada)', () => {
  async function statusDaPlaca(detalhe: LinhaDetalheEntrega[]): Promise<string> {
    const linhas = [linhaKpi({ carga: 'C001', placa: 'ABC1234' })]
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-08-23', [], detalhe)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const wsPlaca = wb.getWorksheet('ABC1234')!
    return (wsPlaca.getRow(4).values as unknown[]).slice(1)[7] as string
  }

  it('caso real RBI1E10/2391359 e RQV8A12/216127: confirmado + "TEMPO EM LOJA ACIMA DE 4H - CONFERIR" -> "ENTREGUE - TEMPO EM LOJA ACIMA DE 4H"', async () => {
    const status = await statusDaPlaca([detalheFixture({
      nf: '2391359', status: 'confirmado_gps', observacao: 'TEMPO EM LOJA ACIMA DE 4H - CONFERIR',
    })])
    expect(status).toBe('ENTREGUE - TEMPO EM LOJA ACIMA DE 4H')
    expect(status.startsWith('ENTREGUE')).toBe(true)
  })

  it('confirmado + observacao ja comecando com ENTREGUE (ex. "ENTREGUE POR OUTRA PLACA...") passa direto, sem prefixo duplicado', async () => {
    const status = await statusDaPlaca([detalheFixture({
      status: 'confirmado_gps', observacao: 'ENTREGUE POR OUTRA PLACA (RQV6I51) - CARGA TRANSFERIDA',
    })])
    expect(status).toBe('ENTREGUE POR OUTRA PLACA (RQV6I51) - CARGA TRANSFERIDA')
  })

  it('confirmado sem observacao -> "ENTREGUE" simples (comportamento antigo preservado)', async () => {
    const status = await statusDaPlaca([detalheFixture({ status: 'confirmado_unitrac', observacao: null })])
    expect(status).toBe('ENTREGUE')
  })

  it('qualquer outra observacao residual coexistindo com status confirmado ganha o mesmo prefixo generico (defesa)', async () => {
    const status = await statusDaPlaca([detalheFixture({
      status: 'confirmado_unitrac', observacao: 'ALGUM ROTULO FUTURO NAO PREVISTO - CONFERIR',
    })])
    expect(status).toBe('ENTREGUE - ALGUM ROTULO FUTURO NAO PREVISTO - CONFERIR')
  })

  it('pendente continua mostrando a observacao pura (nenhuma mudanca de comportamento pra nao confirmado)', async () => {
    const status = await statusDaPlaca([detalheFixture({
      status: 'pendente', observacao: 'PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR',
    })])
    expect(status).toBe('PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR')
  })
})

// 29/09 (P0 da Ana, KPI-Nutry-Max-2026-09-29): RQO9H37 saia "SEM RASTREADOR"
// no detalhe e "EM ROTA" no resumo (aba 1 + cabecalho da aba da placa). O
// rotulo do resumo tem que ser o MESMO do detalhe, e as contagens batem.
describe('consistencia resumo x detalhe: SEM RASTREADOR (29/09)', () => {
  const OBS_SR = 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO'
  const HOJE = '2026-09-29'
  const montar = () => {
    const linhas: LinhaKpiRomaneio[] = [
      // cv + ponte (temRastreador true), 0 posicoes no dia: detalhe ja' sai SEM RASTREADOR
      linhaKpi({ carga: 'PAO-4', placa: 'RQO9H37', nfPlanejado: 3, paradasReais: 0, temRastreador: true, kmPercorrido: 0 }),
      // sem sinal detectado automaticamente (temRastreador false)
      linhaKpi({ carga: 'PAO-1', placa: 'RQV8J31', nfPlanejado: 2, paradasReais: 0, temRastreador: false }),
      // rota normal em andamento: continua EM ROTA
      linhaKpi({ carga: 'C010', placa: 'ABC1234', nfPlanejado: 2, paradasReais: 1, temRastreador: true, saidaCd: '2026-09-29T06:00:00.000Z' }),
    ]
    const detalhe: LinhaDetalheEntrega[] = [
      ...['1', '2', '3'].map(n => detalheFixture({ carga: 'PAO-4', placa: 'RQO9H37', nf: `A${n}`, observacao: OBS_SR, saidaCd: null, chegadaCd: null })),
      ...['1', '2'].map(n => detalheFixture({ carga: 'PAO-1', placa: 'RQV8J31', nf: `B${n}`, temRastreador: false, observacao: OBS_SR, saidaCd: null, chegadaCd: null })),
      detalheFixture({ carga: 'C010', placa: 'ABC1234', nf: 'C1', status: 'confirmado_gps' }),
      detalheFixture({ carga: 'C010', placa: 'ABC1234', nf: 'C2', observacao: 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO' }),
    ]
    return { linhas, detalhe }
  }

  it('aba 1: SAIDA/CHEGADA CD = "SEM RASTREADOR" (nunca EM ROTA/SEM CADASTRO) e soma de NFs = "NFs sem rastreador: N" = linhas do detalhe', async () => {
    const { linhas, detalhe } = montar()
    const buffer = await gerarKpiRomaneioXlsx(linhas, HOJE, [], detalhe, HOJE, undefined, { resumoConfirmacao: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.worksheets[0]
    const idxSaida = COLUNAS_KPI_ROMANEIO.indexOf('SAÍDA CD') + 1
    const idxChegada = COLUNAS_KPI_ROMANEIO.indexOf('CHEGADA CD') + 1
    const idxPlaca = COLUNAS_KPI_ROMANEIO.indexOf('PLACA') + 1
    const idxNfPlan = COLUNAS_KPI_ROMANEIO.indexOf('NF PLANEJADO') + 1
    const porPlaca = new Map<string, { saida: unknown; chegada: unknown; nfs: number }>()
    for (let r = LINHA_PRIMEIRO_DADO; r < LINHA_PRIMEIRO_DADO + linhas.length; r++) {
      const row = ws.getRow(r)
      porPlaca.set(String(row.getCell(idxPlaca).value), { saida: row.getCell(idxSaida).value, chegada: row.getCell(idxChegada).value, nfs: Number(row.getCell(idxNfPlan).value) })
    }
    expect(porPlaca.get('RQO9H37')).toMatchObject({ saida: 'SEM RASTREADOR', chegada: 'SEM RASTREADOR' })
    expect(porPlaca.get('RQV8J31')).toMatchObject({ saida: 'SEM RASTREADOR', chegada: 'SEM RASTREADOR' })
    expect(porPlaca.get('ABC1234')?.chegada).toBe('EM ROTA')

    const nfsResumoSemRastreador = [...porPlaca.values()].filter(v => v.saida === 'SEM RASTREADOR').reduce((a, v) => a + v.nfs, 0)
    const totais = ws.getRow(ws.rowCount).getCell(1).value as string
    const n = Number(/NFs sem rastreador: (\d+)/.exec(totais)?.[1])
    const nfsDetalheSemRastreador = wb.worksheets.slice(1)
      .flatMap(w => w.getSheetValues().slice(4) as unknown[][])
      .filter(v => Array.isArray(v) && String(v[8] ?? '').startsWith('SEM RASTREADOR')).length
    expect(nfsResumoSemRastreador).toBe(5)
    expect(n).toBe(5)
    expect(nfsDetalheSemRastreador).toBe(5)
    expect(totais).toContain('NFs aguardando fim da rota: 1')
  })

  it('cabecalho da aba da placa usa o mesmo rotulo (RQO9H37: SAIDA CD: SEM RASTREADOR)', async () => {
    const { linhas, detalhe } = montar()
    const buffer = await gerarKpiRomaneioXlsx(linhas, HOJE, [], detalhe, HOJE, undefined, { resumoConfirmacao: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const cab = wb.getWorksheet('RQO9H37')!.getRow(2).getCell(1).value as string
    expect(cab).toContain('SAÍDA CD: SEM RASTREADOR')
    expect(cab).toContain('CHEGADA CD: SEM RASTREADOR')
    const cabAbc = wb.getWorksheet('ABC1234')!.getRow(2).getCell(1).value as string
    expect(cabAbc).toContain('CHEGADA CD: EM ROTA')
  })
})

// Task 2 (plano 2026-09-30, item 1 -- RQO9H37, rastreador congelado com dado
// de 13-36 h atras): o detalhe marca SEM RASTREADOR (gpsCongelado, placa
// inteira) mas uma NF da mesma placa confirmada pela Unitrac fazia o resumo
// cair em "EM ROTA" (criterio antigo exigia TODAS as NFs sem rastreador).
// Fonte unica: a placa e' SEM RASTREADOR no resumo se o detalhe marca
// qualquer NF dela assim; o total "NFs sem rastreador: N" conta as mesmas.
describe('consistencia resumo x detalhe: rastreador congelado com NF confirmada pela Unitrac (Task 2, item 1)', () => {
  const OBS_SR = 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO'
  const HOJE = '2026-09-29'
  const montar = () => {
    const linhas: LinhaKpiRomaneio[] = [
      linhaKpi({ carga: '98970', placa: 'RQO9H37', nfPlanejado: 3, paradasReais: 1, temRastreador: true, kmPercorrido: 0 }),
    ]
    const detalhe: LinhaDetalheEntrega[] = [
      detalheFixture({ carga: '98970', placa: 'RQO9H37', nf: 'A1', observacao: OBS_SR, evidencia: 'sem_rastreador' }),
      detalheFixture({ carga: '98970', placa: 'RQO9H37', nf: 'A2', observacao: OBS_SR, evidencia: 'sem_rastreador' }),
      detalheFixture({ carga: '98970', placa: 'RQO9H37', nf: 'A3', status: 'confirmado_unitrac', evidencia: 'alvo_feito_unitrac' }),
    ]
    return { linhas, detalhe }
  }

  it('aba 1 e cabecalho da aba mostram SEM RASTREADOR (nunca EM ROTA) e o total bate com o detalhe', async () => {
    const { linhas, detalhe } = montar()
    const buffer = await gerarKpiRomaneioXlsx(linhas, HOJE, [], detalhe, HOJE, undefined, { resumoConfirmacao: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.worksheets[0]
    const row = ws.getRow(LINHA_PRIMEIRO_DADO)
    expect(row.getCell(COLUNAS_KPI_ROMANEIO.indexOf('SAÍDA CD') + 1).value).toBe('SEM RASTREADOR')
    expect(row.getCell(COLUNAS_KPI_ROMANEIO.indexOf('CHEGADA CD') + 1).value).toBe('SEM RASTREADOR')
    const cab = wb.getWorksheet('RQO9H37')!.getRow(2).getCell(1).value as string
    expect(cab).toContain('SAÍDA CD: SEM RASTREADOR')
    expect(cab).toContain('CHEGADA CD: SEM RASTREADOR')
    const totais = ws.getRow(ws.rowCount).getCell(1).value as string
    const n = Number(/NFs sem rastreador: (\d+)/.exec(totais)?.[1])
    const nfsDetalhe = (wb.getWorksheet('RQO9H37')!.getSheetValues().slice(4) as unknown[][])
      .filter(v => Array.isArray(v) && String(v[8] ?? '').startsWith('SEM RASTREADOR')).length
    expect(n).toBe(2)
    expect(nfsDetalhe).toBe(2)
  })
})

// Task 2 (plano 2026-09-30, item 2): aviso NF Escala x Romaneio visivel e nao
// invasivo -- linha na aba Avisos + nota no fim da linha de totais; taxa e
// denominador intocados.
describe('aviso NFs da Escala x Romaneio (Task 2, item 2)', () => {
  const HOJE = '2026-09-30'
  const linhas: LinhaKpiRomaneio[] = [linhaKpi({ carga: '98969', placa: 'RQS7H76', nfPlanejado: 34, temRastreador: true })]
  const detalhe: LinhaDetalheEntrega[] = [
    detalheFixture({ carga: '98969', placa: 'RQS7H76', nf: '2397192', status: 'confirmado_gps' }),
    detalheFixture({ carga: '98969', placa: 'RQS7H76', nf: '2397193', status: 'pendente', observacao: 'NÃO FOI AO CLIENTE' }),
  ]
  const avisos: AvisoDescasamento[] = [{ carga: '98969', placa: 'RQS7H76', motivo: 'nf_divergente', nfEscala: 34, nfRomaneio: 32 }]

  it('aba Avisos descreve "Escala 34 × Romaneio 32 (2 NFs a menos no romaneio)"', async () => {
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-09-29', avisos, detalhe, HOJE, undefined, { resumoConfirmacao: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const row = wb.getWorksheet('Avisos')!.getRow(2)
    expect(row.getCell(3).value).toBe('NFs: Escala 34 × Romaneio 32 (2 NFs a menos no romaneio)')
  })

  it('linha de totais ganha nota de aviso e a taxa nao muda (1 de 2)', async () => {
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-09-29', avisos, detalhe, HOJE, undefined, { resumoConfirmacao: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.worksheets[0]
    const totais = ws.getRow(ws.rowCount).getCell(1).value as string
    expect(totais).toContain('50,0% (1 de 2 NFs')
    expect(totais).toContain('AVISO: 1 carga com NFs da Escala ≠ Romaneio (Escala 34 × Romaneio 32; 2 NFs a menos no romaneio, fora da conta) — ver aba Avisos')
  })
})

// Task 2 (plano 2026-09-30, item 3 -- PAO-11 29/09): 2 NFs de carga SEM PLACA
// entravam no rodape "NFs sem rastreador: 21" (19 reais + 2). Carga sem placa
// e' categoria propria: fora da taxa, contada a parte no rodape, e o STATUS
// do detalhe diz "CARGA SEM PLACA" (nunca "SEM RASTREADOR").
describe('carga sem placa fora do "NFs sem rastreador" (Task 2, item 3)', () => {
  const OBS_SR = 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO'
  const HOJE = '2026-09-30'
  const linhas: LinhaKpiRomaneio[] = [
    linhaKpi({ carga: 'PAO-11', placa: '', nfPlanejado: 2, temRastreador: false }),
    linhaKpi({ carga: '98970', placa: 'RQO9H37', nfPlanejado: 1, temRastreador: true }),
    linhaKpi({ carga: '98971', placa: 'ABC1234', nfPlanejado: 2, temRastreador: true }),
  ]
  const detalhe: LinhaDetalheEntrega[] = [
    detalheFixture({ carga: 'PAO-11', placa: '', nf: '216274', temRastreador: false, observacao: OBS_SR, evidencia: 'sem_rastreador' }),
    detalheFixture({ carga: 'PAO-11', placa: '', nf: '216275', temRastreador: false, observacao: OBS_SR, evidencia: 'sem_rastreador' }),
    detalheFixture({ carga: '98970', placa: 'RQO9H37', nf: 'A1', observacao: OBS_SR, evidencia: 'sem_rastreador' }),
    detalheFixture({ carga: '98971', placa: 'ABC1234', nf: 'C1', status: 'confirmado_gps' }),
    detalheFixture({ carga: '98971', placa: 'ABC1234', nf: 'C2', observacao: 'NÃO FOI AO CLIENTE' }),
  ]

  it('rodape: 1 sem rastreador + 2 de carga sem placa, ambos fora da conta; taxa 1 de 2', async () => {
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-09-29', [], detalhe, HOJE, undefined, { resumoConfirmacao: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.worksheets[0]
    const totais = ws.getRow(ws.rowCount).getCell(1).value as string
    expect(totais).toContain('50,0% (1 de 2 NFs; 1 sem rastreador e 2 de carga sem placa fora da conta)')
    expect(totais).toContain('NFs sem rastreador: 1')
    expect(totais).toContain('NFs de carga sem placa: 2 (fora da conta)')
  })

  it('STATUS das NFs da carga sem placa diz CARGA SEM PLACA (nunca SEM RASTREADOR)', async () => {
    const buffer = await gerarKpiRomaneioXlsx(linhas, '2026-09-29', [], detalhe, HOJE, undefined, { resumoConfirmacao: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const vals = wb.getWorksheet('SEM PLACA')!.getSheetValues().slice(4) as unknown[][]
    const status = vals.filter(Array.isArray).map(v => String(v[8]))
    expect(status).toEqual(['CARGA SEM PLACA - NÃO CONTABILIZADO', 'CARGA SEM PLACA - NÃO CONTABILIZADO'])
  })
})
