import { describe, it, expect } from 'vitest'
import { tabToDate } from './escala-pax'

describe('tabToDate', () => {
  it('converte tab "15" com ano 2025 e mês 3 → "2025-03-15"', () => {
    expect(tabToDate('15', 2025, 3)).toBe('2025-03-15')
  })

  it('converte tab "05" com ano 2024 e mês 12 → "2024-12-05"', () => {
    expect(tabToDate('05', 2024, 12)).toBe('2024-12-05')
  })

  it('converte tab "1" (sem zero à esquerda) com ano 2025 e mês 1 → "2025-01-01"', () => {
    expect(tabToDate('1', 2025, 1)).toBe('2025-01-01')
  })

  it('trim em tab com espaços: " 7 " com ano 2025 e mês 6 → "2025-06-07"', () => {
    expect(tabToDate(' 7 ', 2025, 6)).toBe('2025-06-07')
  })

  it('retorna string vazia quando tab não é numérico (ex: "jan")', () => {
    expect(tabToDate('jan', 2025, 1)).toBe('')
  })

  it('NÃO usa defaults hardcoded — usa os parâmetros passados', () => {
    // Garante que a função respeita ano/mes recebidos, não valores fixos
    expect(tabToDate('10', 2023, 7)).toBe('2023-07-10')
    expect(tabToDate('10', 2026, 11)).toBe('2026-11-10')
  })
})

describe('parseEscalaPax — colunas por cabeçalho + data da aba (regressão jun/2026)', () => {
  // Monta uma planilha no formato real: aba "05", seção com data no cabeçalho,
  // colunas FILIAL|QTD|TIPO|MOTORISTA|CÓDIGO|PLACA (ordem nova de junho).
  async function buildWb(rows: { rede: string; headerDate: Date; colHeader: string[]; data: string[][] }[]) {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('05')
    let r = 1
    for (const sec of rows) {
      const h = ws.getRow(r++)
      h.getCell(4).value = sec.rede; h.getCell(5).value = sec.rede; h.getCell(6).value = sec.rede
      h.getCell(7).value = sec.headerDate; h.getCell(8).value = sec.headerDate; h.getCell(9).value = sec.headerDate
      const ch = ws.getRow(r++)
      sec.colHeader.forEach((lbl, i) => { ch.getCell(4 + i).value = lbl })
      for (const d of sec.data) {
        const dr = ws.getRow(r++)
        d.forEach((v, i) => { dr.getCell(4 + i).value = v })
      }
    }
    return Buffer.from(await wb.xlsx.writeBuffer())
  }

  it('lê MOTORISTA/PLACA pela posição do cabeçalho (ordem nova, não invertida)', async () => {
    const { parseEscalaPax } = await import('./escala-pax')
    const buf = await buildWb([{
      rede: 'SUPER PAX', headerDate: new Date(Date.UTC(2026, 5, 5)),
      colHeader: ['FILIAL', 'QTD', 'TIPO', 'MOTORISTA', 'CÓDIGO', 'PLACA'],
      data: [['Sepetiba', '1', 'TOCO C/RAMPA', 'DENIS BEZERRA', '353', 'SVB-1F74']],
    }])
    const linhas = await parseEscalaPax(buf, '2026-06-05')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].motorista_nome).toBe('DENIS BEZERRA')
    expect(linhas[0].placa_norm).toBe('SVB1F74')
  })

  it('mantém compatibilidade com a ordem ANTIGA (PLACA antes de MOTORISTA)', async () => {
    const { parseEscalaPax } = await import('./escala-pax')
    const buf = await buildWb([{
      rede: 'SUPER PAX', headerDate: new Date(Date.UTC(2026, 5, 5)),
      colHeader: ['FILIAL', 'QTD', 'TIPO', 'PLACA', 'PALLETES SUPORTADOS', 'MOTORISTA'],
      data: [['Sepetiba', '1', 'TOCO C/RAMPA', 'SVB-1F74', '10', 'DENIS BEZERRA']],
    }])
    const linhas = await parseEscalaPax(buf, '2026-06-05')
    expect(linhas[0].motorista_nome).toBe('DENIS BEZERRA')
    expect(linhas[0].placa_norm).toBe('SVB1F74')
  })

  it('NÃO pula seção cuja data de cabeçalho está desatualizada (usa a data da aba)', async () => {
    const { parseEscalaPax } = await import('./escala-pax')
    const buf = await buildWb([
      { rede: 'SUPER PAX', headerDate: new Date(Date.UTC(2026, 5, 5)),
        colHeader: ['FILIAL', 'QTD', 'TIPO', 'MOTORISTA', 'CÓDIGO', 'PLACA'],
        data: [['Sepetiba', '1', 'TOCO', 'DENIS', '353', 'SVB-1F74']] },
      // Feira Nova com data STALE 06-01 (erro comum na planilha) — não pode sumir
      { rede: 'FEIRA NOVA', headerDate: new Date(Date.UTC(2026, 5, 1)),
        colHeader: ['FILIAL', 'QTD', 'TIPO', 'MOTORISTA', 'CÓDIGO', 'PLACA'],
        data: [['1- Nilopolis', '1', 'TOCO', 'JOSUE', '714', 'BBH-1C94']] },
    ])
    const linhas = await parseEscalaPax(buf, '2026-06-05')
    const redes = new Set(linhas.map(l => l.rede_id))
    expect(redes.has('SUPER_PAX')).toBe(true)
    expect(redes.has('FEIRA_NOVA')).toBe(true) // antes sumia por causa da data stale
  })
})
