import ExcelJS from 'exceljs'
import { describe, it, expect } from 'vitest'
import { parseEscalaArquivo } from './escala-arquivo'

// Escala piloto alternativa: 3 colunas "REDE/ FILIAL | MOTORISTA | PLACA",
// 1 aba, sem cor, sem código. Os parsers específicos falham → cai no universal.
async function buildPiloto(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Planilha1')
  ws.getRow(1).getCell(1).value = 'ESCALA DE APENAS UMA REDE'
  const r2 = ws.getRow(2)
  r2.getCell(1).value = 'REDE/ FILIAL'; r2.getCell(2).value = 'MOTORISTA'; r2.getCell(3).value = 'PLACA'
  const rows = [
    ['Assaí - Alcântara', 'JOSÉLIO', 'KRK-3D12'],
    ['Assaí - Araruama', 'LUCIANO', 'QSS-1E48'],
    ['Atacadão - Manilha', 'PEDRO', 'LSN-6I73'],
  ]
  rows.forEach((r, i) => {
    const row = ws.getRow(3 + i)
    row.getCell(1).value = r[0]; row.getCell(2).value = r[1]; row.getCell(3).value = r[2]
  })
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

describe('parseEscalaArquivo — escala piloto (universal na cascata)', () => {
  it('reconhece a escala piloto via universal e infere rede por loja', async () => {
    const linhas = await parseEscalaArquivo(await buildPiloto(), 'piloto.xlsx', '2026-06-11')
    expect(linhas.length).toBe(3)
    expect(linhas[0].loja_nome_raw).toBe('Assaí - Alcântara')
    expect(linhas[0].placa_norm).toBe('KRK3D12')
    expect(linhas[0].rede_id).toBe('ASSAI')
    expect(linhas[2].rede_id).toBe('ATACADAO')
  })
})
