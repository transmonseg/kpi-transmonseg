import ExcelJS from 'exceljs'
import { describe, it, expect } from 'vitest'
import { parseEscalaUniversal } from './escala-universal'

/** Constrói XLSX em memória com header derivado das chaves do primeiro objeto */
async function buildXlsx(rows: Array<Record<string, string | number | null>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Planilha1')
  if (rows.length > 0) {
    const headers = Object.keys(rows[0])
    ws.addRow(headers)
    for (const row of rows) ws.addRow(headers.map(h => row[h] ?? null))
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

describe('parseEscalaUniversal — detecção por cabeçalho', () => {
  it('detecta colunas PLACA e LOJA e infere rede', async () => {
    const buf = await buildXlsx([
      { PLACA: 'GAJ-6H51', LOJA: 'Prezunic - Icaraí', MOTORISTA: 'ESTELITA' },
      { PLACA: 'EZU-9325', LOJA: 'Assaí - Ceasa - Loja 42', MOTORISTA: 'ANTONIO CARLOS' },
    ])
    const linhas = await parseEscalaUniversal(buf, '2026-06-10')
    expect(linhas).toHaveLength(2)
    expect(linhas[0].placa_norm).toBe('GAJ6H51')
    expect(linhas[0].rede_id).toBe('PREZUNIC')
    expect(linhas[1].rede_id).toBe('ASSAI')
  })

  it('aceita cabeçalho VEÍCULO em vez de PLACA', async () => {
    const buf = await buildXlsx([
      { VEÍCULO: 'KZC-4D39', LOJA: 'Super Prix - Icaraí', MOTORISTA: 'RODRIGO' },
    ])
    const linhas = await parseEscalaUniversal(buf, '2026-06-10')
    expect(linhas[0].placa_norm).toBe('KZC4D39')
    expect(linhas[0].rede_id).toBe('SUPERPRIX')
  })

  it('aceita cabeçalho ROTA em vez de LOJA', async () => {
    const buf = await buildXlsx([
      { PLACA: 'ABC1234', ROTA: 'Guanabara - Bonsucesso', MOTORISTA: 'JOSE' },
    ])
    const linhas = await parseEscalaUniversal(buf, '2026-06-10')
    expect(linhas[0].rede_id).toBe('GUANABARA')
  })
})

describe('parseEscalaUniversal — sem cabeçalho (detecção por padrão de placa)', () => {
  it('acha coluna de placa por regex e infere loja da coluna adjacente', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Planilha1')
    // Sem linha de cabeçalho — col 1=loja, col 2=placa
    ws.addRow(['Atacadão Belford Roxo', 'LSN-6I73'])
    ws.addRow(['Prezunic - Icaraí', 'GAJ-6H51'])
    const buf = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
    const linhas = await parseEscalaUniversal(buf, '2026-06-10')
    expect(linhas.length).toBeGreaterThanOrEqual(1)
    const gaj = linhas.find(l => l.placa_norm === 'GAJ6H51')
    expect(gaj?.rede_id).toBe('PREZUNIC')
  })
})

describe('parseEscalaUniversal — carro_ordem', () => {
  it('segunda linha da mesma loja recebe carro_ordem=2', async () => {
    const buf = await buildXlsx([
      { PLACA: 'ABC1234', LOJA: 'Assaí - Barra II', MOTORISTA: 'JOAO' },
      { PLACA: 'DEF5678', LOJA: 'Assaí - Barra II', MOTORISTA: 'PEDRO' },
      { PLACA: 'GHI9012', LOJA: 'Prezunic - Botafogo', MOTORISTA: 'CARLOS' },
    ])
    const linhas = await parseEscalaUniversal(buf, '2026-06-10')
    expect(linhas[0].carro_ordem).toBe(1)
    expect(linhas[1].carro_ordem).toBe(2)
    expect(linhas[2].carro_ordem).toBe(1)
  })
})

describe('parseEscalaUniversal — rede única (caso ela filtrar a escala)', () => {
  it('retorna linhas quando só há uma rede na planilha', async () => {
    const buf = await buildXlsx([
      { PLACA: 'ABC1234', LOJA: 'Assaí - Ceasa - Loja 42', MOTORISTA: 'ANTONIO CARLOS' },
    ])
    const linhas = await parseEscalaUniversal(buf, '2026-06-10')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].rede_id).toBe('ASSAI')
  })
})

// --- Escala PILOTO: 3 colunas "REDE/ FILIAL | MOTORISTA | PLACA", 1 rede, sem cor ---
// Formato alternativo simples que o cliente quer suportar. Sem data no arquivo
// (vem do dataAlvo), sem código, loja na 1ª coluna com header "REDE/ FILIAL".
describe('parseEscalaUniversal — escala piloto (REDE/FILIAL)', () => {
  async function buildPiloto(): Promise<Buffer> {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Planilha1')
    ws.getRow(1).getCell(1).value = 'ESCALA DE APENAS UMA REDE'
    const r2 = ws.getRow(2)
    r2.getCell(1).value = 'REDE/ FILIAL'; r2.getCell(2).value = 'MOTORISTA'; r2.getCell(3).value = 'PLACA'
    const rows = [
      ['Assaí - Alcântara', 'JOSÉLIO', 'KRK-3D12'],
      ['Assaí - Alcântara', 'LUIZ CARLOS', 'FQN6J72'],
      ['Assaí - Araruama', 'LUCIANO MATIAS', 'QSS-1E48'],
    ]
    rows.forEach((r, i) => {
      const row = ws.getRow(3 + i)
      row.getCell(1).value = r[0]; row.getCell(2).value = r[1]; row.getCell(3).value = r[2]
    })
    return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
  }

  it('detecta loja na coluna "REDE/ FILIAL" e infere rede ASSAI', async () => {
    const linhas = await parseEscalaUniversal(await buildPiloto(), '2026-06-11')
    expect(linhas).toHaveLength(3)
    expect(linhas[0].loja_nome_raw).toBe('Assaí - Alcântara')
    expect(linhas[0].placa_norm).toBe('KRK3D12')
    expect(linhas[0].motorista_nome).toBe('JOSÉLIO')
    expect(linhas[0].rede_id).toBe('ASSAI')
  })

  it('2ª linha da mesma loja vira carro 2; loja diferente reinicia em 1', async () => {
    const linhas = await parseEscalaUniversal(await buildPiloto(), '2026-06-11')
    expect(linhas[0].carro_ordem).toBe(1) // Alcântara 1
    expect(linhas[1].carro_ordem).toBe(2) // Alcântara 2
    expect(linhas[2].carro_ordem).toBe(1) // Araruama 1
  })
})
