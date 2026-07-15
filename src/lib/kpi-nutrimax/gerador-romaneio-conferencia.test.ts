import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarRomaneioConferencia } from './gerador-romaneio-conferencia'
import type { RelatorioPlacaNutrimax } from './types'

const base: RelatorioPlacaNutrimax = {
  carga: '92593',
  placaRaw: 'TTL7D40',
  placaNorm: 'TTL7D40',
  destino: 'CAMPOS',
  motorista: 'LUAN VIANA AREAS RIBEIRO',
  ajudante1: 'LEANDRO DA HORA BATISTA',
  ajudante2: null,
  pesoKg: 2405,
  nfPlanejado: 2,
  nfRecebido: 2,
  entPlanejado: 2,
  entRecebido: 2,
  status: 'ok',
  clientes: [
    {
      nf: '1', clienteNome: 'ANDRE LUIS SILVA VELASCO', endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *',
      parada: {
        chegada: '2026-07-15T10:00:00.000Z', saida: '2026-07-15T10:15:00.000Z', distanciaKm: 12.5,
        localParada: '165049 - ANDRE LUIS SILVA VELASCO', codigoLoja: '165049', nomeLoja: 'ANDRE LUIS SILVA VELASCO',
      },
    },
    { nf: '2', clienteNome: 'M A SARDINHA', endereco: 'RUA Y, 2 - BAIRRO, CAMPOS - *', parada: null },
  ],
  kmPercorrido: 93.5,
  qtdParadasReal: 2,
  inicioViagem: '2026-07-15T05:07:00.000Z',
  fimViagem: '2026-07-15T14:08:00.000Z',
  paradasSemCliente: [],
}

const ausente: RelatorioPlacaNutrimax = {
  ...base,
  carga: '92595',
  placaRaw: 'XXX0000',
  placaNorm: 'XXX0000',
  destino: 'DIRETA FRATELLI',
  nfRecebido: 0,
  entRecebido: 0,
  status: 'ausente',
  clientes: [],
  kmPercorrido: null,
  qtdParadasReal: 0,
  inicioViagem: null,
  fimViagem: null,
  paradasSemCliente: [],
}

describe('gerarRomaneioConferencia', () => {
  it('gera aba Resumo + uma aba por placa, com cabeçalho de marca (logo + faixa azul)', async () => {
    const buf = await gerarRomaneioConferencia([base])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)

    const nomes = wb.worksheets.map(ws => ws.name)
    expect(nomes).toEqual(['Resumo', 'TTL7D40 (92593)'])

    // Logo embutido uma vez, reusado nas duas abas (mesmo imageId).
    expect(wb.model.media?.length).toBe(1)

    const resumo = wb.getWorksheet('Resumo')!
    const tituloResumo = resumo.getCell('A1')
    expect(String(tituloResumo.value)).toMatch(/ROMANEIO NUTRY/i)
    expect(tituloResumo.fill).toMatchObject({ fgColor: { argb: 'FF153C6B' } })
    expect(resumo.getImages()).toHaveLength(1)

    // Linha 3 = header da tabela, linha 4 = primeira carga (linhas 1-2 = faixa de marca)
    expect(resumo.getRow(3).values).toEqual([
      , 'CARGA', 'PLACA', 'DESTINO', 'PESO (KG)', 'CLIENTES', 'NFS', 'KM', 'PARADAS GPS', 'STATUS',
    ])
    const linha4 = resumo.getRow(4).values as unknown[]
    expect(linha4[1]).toBe('92593')
    expect((linha4[2] as { text: string }).text).toBe('TTL7D40') // placa vira link pra aba
    expect(linha4[3]).toBe('CAMPOS')
    expect(linha4[4]).toBe(2405)
    expect(linha4[5]).toBe('2/2')
    expect(linha4[6]).toBe('2/2')
    expect(linha4[7]).toBe(93.5)
    expect(linha4[8]).toBe(2)
    expect(linha4[9]).toBe('OK')

    const aba = wb.getWorksheet('TTL7D40 (92593)')!
    expect(aba.getImages()).toHaveLength(1)
    const linhas = aba.getSheetValues().filter(Boolean).map(r => (r as unknown[]).slice(1))
    expect(linhas).toContainEqual(['MOTORISTA', 'LUAN VIANA AREAS RIBEIRO'])
    expect(linhas).toContainEqual(['KM PERCORRIDO', 93.5])
    expect(linhas).toContainEqual(['INÍCIO VIAGEM', '05:07'])
    expect(linhas).toContainEqual(['FIM VIAGEM', '14:08'])
    expect(linhas).toContainEqual(['CLIENTES (ENT)', '2 / 2'])
    expect(linhas).toContainEqual(['NF', 'CLIENTE', 'ENDEREÇO', 'CONFIRMADO GPS', 'CHEGADA', 'KM'])
    expect(linhas).toContainEqual(['1', 'ANDRE LUIS SILVA VELASCO', 'RUA X, 1 - BAIRRO, CAMPOS - *', 'SIM', '10:00', 12.5])
    expect(linhas).toContainEqual(['2', 'M A SARDINHA', 'RUA Y, 2 - BAIRRO, CAMPOS - *', 'NÃO', '', ''])
  })

  it('duas cargas com a mesma placa geram abas com nomes distintos (placa + carga)', async () => {
    const buf = await gerarRomaneioConferencia([
      base,
      { ...base, carga: '92594', clientes: [] },
    ])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const nomes = wb.worksheets.map(ws => ws.name)
    expect(nomes).toEqual(['Resumo', 'TTL7D40 (92593)', 'TTL7D40 (92594)'])
  })

  it('relatório vazio gera só a aba Resumo, com cabeçalho de marca', async () => {
    const buf = await gerarRomaneioConferencia([])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.worksheets.map(ws => ws.name)).toEqual(['Resumo'])
    expect(wb.getWorksheet('Resumo')!.getImages()).toHaveLength(1)
  })

  it('Resumo tem cabeçalho travado (linhas 1-3) pra não sumir ao rolar', async () => {
    const buf = await gerarRomaneioConferencia([base])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const resumo = wb.getWorksheet('Resumo')!
    expect(resumo.views).toContainEqual(expect.objectContaining({ state: 'frozen', ySplit: 3 }))
  })

  it('aba de placa AUSENTE fica com a abinha vermelha; PLACA no Resumo é link pra aba', async () => {
    const buf = await gerarRomaneioConferencia([base, ausente])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)

    const abaAusente = wb.getWorksheet('XXX0000 (92595)')!
    expect(abaAusente.properties.tabColor).toEqual({ argb: 'FF991B1B' })

    const abaOk = wb.getWorksheet('TTL7D40 (92593)')!
    expect(abaOk.properties.tabColor).toEqual({ argb: 'FF065F46' })

    const resumo = wb.getWorksheet('Resumo')!
    const linkCell = resumo.getCell('B4')
    expect(linkCell.text).toBe('TTL7D40')
    expect(linkCell.hyperlink).toBe("#'TTL7D40 (92593)'!A1")
  })

  it('linha TOTAL no fim do Resumo soma o peso do dia', async () => {
    const buf = await gerarRomaneioConferencia([base, { ...base, carga: '92594', pesoKg: 1000 }])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const resumo = wb.getWorksheet('Resumo')!
    // linha 3 = header, linhas 4-5 = as 2 cargas, linha 6 = TOTAL
    const totalRow = resumo.getRow(6).values as unknown[]
    expect(totalRow[1]).toBe('TOTAL')
    expect(totalRow[4]).toBe(2405 + 1000)
  })

  it('cliente confirmado por GPS fica verde; sem confirmação fica âmbar', async () => {
    const buf = await gerarRomaneioConferencia([base])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const aba = wb.getWorksheet('TTL7D40 (92593)')!
    const rows = aba.getRows(1, aba.rowCount) ?? []
    const linhaConfirmada = rows.find(r => r.getCell(1).value === '1')!
    const linhaNaoConfirmada = rows.find(r => r.getCell(1).value === '2')!
    expect(linhaConfirmada.getCell(4).value).toBe('SIM')
    expect(linhaConfirmada.getCell(4).fill).toMatchObject({ fgColor: { argb: 'FFD1FAE5' } })
    expect(linhaNaoConfirmada.getCell(4).value).toBe('NÃO')
    expect(linhaNaoConfirmada.getCell(4).fill).toMatchObject({ fgColor: { argb: 'FFFEF3C7' } })
  })

  it('paradas sem cliente identificado aparecem numa seção à parte, só quando existem', async () => {
    const comSobra: RelatorioPlacaNutrimax = {
      ...base,
      paradasSemCliente: [{
        chegada: '2026-07-15T11:00:00.000Z', saida: '2026-07-15T11:10:00.000Z', distanciaKm: 5.2,
        localParada: '999999 - LOJA FANTASMA', codigoLoja: '999999', nomeLoja: 'LOJA FANTASMA',
      }],
    }
    const buf = await gerarRomaneioConferencia([comSobra])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const aba = wb.getWorksheet('TTL7D40 (92593)')!
    const linhas = aba.getSheetValues().filter(Boolean).map(r => (r as unknown[]).slice(1))
    expect(linhas).toContainEqual(['PARADAS SEM CLIENTE IDENTIFICADO'])
    expect(linhas).toContainEqual(['LOCAL', 'CHEGADA', 'KM'])
    expect(linhas).toContainEqual(['999999 - LOJA FANTASMA', '11:00', 5.2])

    const buf2 = await gerarRomaneioConferencia([base])
    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(buf2 as unknown as ArrayBuffer)
    const aba2 = wb2.getWorksheet('TTL7D40 (92593)')!
    const linhas2 = aba2.getSheetValues().filter(Boolean).map(r => (r as unknown[]).slice(1))
    expect(linhas2).not.toContainEqual(['PARADAS SEM CLIENTE IDENTIFICADO'])
  })
})
