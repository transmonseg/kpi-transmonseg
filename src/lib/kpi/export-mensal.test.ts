import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { montarXlsxMensal, type RawDoDia } from './export-mensal'

// monta um XLSX fake com uma aba nomeada `dia`, simulando o arquivo bruto inserido,
// com formatação (merge + fill) pra provar que o layout é preservado na cópia
async function rawFake(dia: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(dia)
  ws.getColumn(1).width = 42
  ws.mergeCells('A1:C1')
  const t = ws.getCell('A1')
  t.value = `RELATÓRIO ${dia}`
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }
  ws.getCell('A2').value = 'LOJA X'
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

describe('montarXlsxMensal', () => {
  it('consolida uma aba por dia, em ordem', async () => {
    const raws: RawDoDia[] = [
      { dia: '20', buf: await rawFake('20') },
      { dia: '19', buf: await rawFake('19') },
    ]
    const buf = await montarXlsxMensal(raws)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.worksheets.map(w => w.name)).toEqual(['19', '20'])
  })

  it('preserva layout original (merge, fill, larguras, valores)', async () => {
    const buf = await montarXlsxMensal([{ dia: '19', buf: await rawFake('19') }])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('19')!
    expect(ws.getCell('A1').value).toBe('RELATÓRIO 19')
    expect((ws.getCell('A1').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF1F3864')
    expect(ws.getColumn(1).width).toBe(42)
    expect((ws.model as unknown as { merges: string[] }).merges).toContain('A1:C1')
    expect(ws.getCell('A2').value).toBe('LOJA X')
  })

  it('aba vazia quando não há nada no mês', async () => {
    const buf = await montarXlsxMensal([])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.worksheets.map(w => w.name)).toEqual(['vazio'])
  })
})
