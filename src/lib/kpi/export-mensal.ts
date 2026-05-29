import ExcelJS from 'exceljs'

/** Um XLSX bruto (exatamente como a Tia subiu) + o dia que ele representa ("19"). */
export interface RawDoDia {
  dia: string   // "01".."31"
  buf: Buffer
}

/**
 * Monta o KPI mensal de UMA rede consolidando os PRÓPRIOS arquivos que foram
 * inseridos (uma aba por dia), preservando 100% o layout original: título NAVY,
 * 1º/2º carro, cores, tempo em loja, merges. NÃO regenera nada — copia as abas.
 */
export async function montarXlsxMensal(raws: RawDoDia[]): Promise<Buffer> {
  const wbOut = new ExcelJS.Workbook()
  const ordenados = [...raws].sort((a, b) => a.dia.localeCompare(b.dia))

  for (const { dia, buf } of ordenados) {
    const src = new ExcelJS.Workbook()
    await src.xlsx.load(buf as unknown as ArrayBuffer)
    // a aba do dia do XLSX original chama-se "19", "20" etc; fallback p/ a primeira
    const wsSrc = src.getWorksheet(dia) ?? src.worksheets[0]
    if (!wsSrc) continue
    const wsOut = wbOut.addWorksheet(dia, { views: wsSrc.views })
    copiarAba(wsSrc, wsOut)
  }

  if (wbOut.worksheets.length === 0) wbOut.addWorksheet('vazio').addRow(['Sem dados no mês'])
  return Buffer.from(await wbOut.xlsx.writeBuffer() as ArrayBuffer)
}

/** Copia células, estilos, larguras, alturas e merges de uma aba para outra. */
function copiarAba(src: ExcelJS.Worksheet, dst: ExcelJS.Worksheet) {
  // larguras de coluna
  src.columns.forEach((c, i) => { if (c.width) dst.getColumn(i + 1).width = c.width })

  // células (valor + estilo) e altura de linha
  src.eachRow({ includeEmpty: true }, (row, rowNum) => {
    const dRow = dst.getRow(rowNum)
    if (row.height) dRow.height = row.height
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const d = dRow.getCell(colNum)
      d.value = cell.value
      d.style = cell.style
    })
  })

  // células mescladas (A1:O1 etc)
  const merges = (src.model as unknown as { merges?: string[] }).merges
  if (merges) for (const m of merges) { try { dst.mergeCells(m) } catch { /* range já mesclado */ } }
}
