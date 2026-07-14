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

describe('gerarRomaneioConferencia', () => {
  it('gera aba Resumo + uma aba por placa', async () => {
    const buf = await gerarRomaneioConferencia([base])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)

    const nomes = wb.worksheets.map(ws => ws.name)
    expect(nomes).toEqual(['Resumo', 'TTL7D40 (92593)'])

    const resumo = wb.getWorksheet('Resumo')!
    expect(resumo.getRow(1).values).toEqual([, 'CARGA', 'PLACA', 'DESTINO', 'STATUS'])
    expect(resumo.getRow(2).values).toEqual([, '92593', 'TTL7D40', 'CAMPOS', 'OK'])

    const aba = wb.getWorksheet('TTL7D40 (92593)')!
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

  it('relatório vazio gera só a aba Resumo', async () => {
    const buf = await gerarRomaneioConferencia([])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.worksheets.map(ws => ws.name)).toEqual(['Resumo'])
  })
})
