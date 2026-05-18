import ExcelJS from 'exceljs'

export type ClienteMatriz = {
  codigo: string
  filial: string
  nome: string
  fantasia: string
  cnpj: string
  cep: string
  endereco: string
  numero: string
  complemento: string
}

function cellStr(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return ''
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if ('text' in v) return String((v as { text: unknown }).text ?? '').trim()
    if ('result' in v) return String((v as { result: unknown }).result ?? '').trim()
    if ('richText' in v)
      return (v as { richText: { text: string }[] }).richText.map(r => r.text).join('').trim()
  }
  return String(v).trim()
}

export async function parseMatrizClientes(
  buffer: ArrayBuffer | Buffer
): Promise<ClienteMatriz[]> {
  const wb = new ExcelJS.Workbook()
  const buf =
    buffer instanceof ArrayBuffer
      ? buffer
      : (buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        ) as ArrayBuffer)
  await wb.xlsx.load(buf)

  const ws = wb.worksheets[0]
  if (!ws) return []

  const clientes: ClienteMatriz[] = []

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return // pula cabeçalho
    const codigo = cellStr(row.getCell(1))
    if (!codigo || isNaN(Number(codigo))) return
    clientes.push({
      codigo,
      filial: cellStr(row.getCell(2)),
      nome: cellStr(row.getCell(3)),
      fantasia: cellStr(row.getCell(4)),
      cnpj: cellStr(row.getCell(5)),
      cep: cellStr(row.getCell(7)),
      endereco: cellStr(row.getCell(8)),
      numero: cellStr(row.getCell(9)),
      complemento: cellStr(row.getCell(10)),
    })
  })

  return clientes
}
