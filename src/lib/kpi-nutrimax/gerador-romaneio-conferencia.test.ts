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
  status: 'ok',
  clientes: [
    { nf: '1', clienteNome: 'ANDRE LUIS SILVA VELASCO', endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *' },
    { nf: '2', clienteNome: 'M A SARDINHA', endereco: 'RUA Y, 2 - BAIRRO, CAMPOS - *' },
  ],
}

const ausente: RelatorioPlacaNutrimax = {
  ...base,
  carga: '92595',
  placaRaw: 'XXX0000',
  placaNorm: 'XXX0000',
  destino: 'DIRETA FRATELLI',
  nfRecebido: 0,
  status: 'ausente',
  clientes: [],
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
    expect(resumo.getRow(3).values).toEqual([, 'CARGA', 'PLACA', 'DESTINO', 'STATUS'])
    const linha4 = resumo.getRow(4).values as unknown[]
    expect(linha4[1]).toBe('92593')
    expect((linha4[2] as { text: string }).text).toBe('TTL7D40') // placa vira link pra aba
    expect(linha4[3]).toBe('CAMPOS')
    expect(linha4[4]).toBe('OK')

    const aba = wb.getWorksheet('TTL7D40 (92593)')!
    expect(aba.getImages()).toHaveLength(1)
    const linhas = aba.getSheetValues().filter(Boolean).map(r => (r as unknown[]).slice(1))
    expect(linhas).toContainEqual(['MOTORISTA', 'LUAN VIANA AREAS RIBEIRO'])
    expect(linhas).toContainEqual(['NF', 'CLIENTE', 'ENDEREÇO'])
    expect(linhas).toContainEqual(['1', 'ANDRE LUIS SILVA VELASCO', 'RUA X, 1 - BAIRRO, CAMPOS - *'])
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
})
