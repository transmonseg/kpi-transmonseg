import ExcelJS from 'exceljs'

export type RotaCozinha = {
  rota: string
  motorista: string
  placa: string
  veiculo: string
}

const PLACA_INVALIDA = new Set([
  'NOENCONTRADO',
  'NAOENCONTRADO',
  'REF',
  '#REF',
  'REF!',
  '0',
  '',
])

const PLACA_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/

function normalizaPlaca(valor: unknown): string {
  if (valor === null || valor === undefined) return '—'
  const s = String(valor).toUpperCase().trim().replace(/[^A-Z0-9]/g, '')
  if (!s) return '—'
  if (s.length === 7 && PLACA_REGEX.test(s)) return `${s.slice(0, 3)}-${s.slice(3)}`
  return s || '—'
}

function placaValida(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false
  const t = String(valor).toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (PLACA_INVALIDA.has(t)) return false
  if (t.length !== 7) return false
  return PLACA_REGEX.test(t)
}

function normalizaNome(valor: unknown): string {
  if (valor === null || valor === undefined) return '—'
  const s = String(valor).trim().replace(/\s+/g, ' ')
  if (!s) return '—'
  // Title case
  return s
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function normalizaRota(valor: string): string {
  return valor.replace(/ROTA:/i, '').trim().toUpperCase().replace(/\s+/g, ' ')
}

function cellValue(cell: ExcelJS.Cell | undefined): unknown {
  if (!cell) return null
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && v !== null) {
    if ('text' in v) return (v as { text: string }).text
    if ('result' in v) return (v as { result: unknown }).result
    if ('richText' in v) {
      return (v as { richText: { text: string }[] }).richText
        .map(r => r.text)
        .join('')
    }
  }
  return v
}

export async function parseCozinha(buffer: ArrayBuffer | Buffer): Promise<RotaCozinha[]> {
  const workbook = new ExcelJS.Workbook()
  const buf =
    buffer instanceof ArrayBuffer
      ? buffer
      : (buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        ) as ArrayBuffer)
  await workbook.xlsx.load(buf)

  const ws = workbook.getWorksheet('MODELO')
  if (!ws) throw new Error('Aba MODELO não encontrada')

  // Encontra todas as células com "ROTA:"
  const rotasPorLinha = new Map<number, { row: number; col: number; value: string }[]>()

  ws.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const v = cellValue(cell)
      if (typeof v === 'string' && v.toUpperCase().includes('ROTA:')) {
        const arr = rotasPorLinha.get(rowNumber) || []
        arr.push({ row: rowNumber, col: colNumber, value: v })
        rotasPorLinha.set(rowNumber, arr)
      }
    })
  })

  if (rotasPorLinha.size === 0) return []

  // Linha com mais ROTAs = tabela principal
  let linhaPrincipal = -1
  let maxRotas = 0
  for (const [linha, lista] of rotasPorLinha) {
    if (lista.length > maxRotas) {
      maxRotas = lista.length
      linhaPrincipal = linha
    }
  }

  const celulasRota = rotasPorLinha.get(linhaPrincipal)!
  const rotas: RotaCozinha[] = []
  const seen = new Set<string>()

  for (const { row, col, value } of celulasRota) {
    const rotaNome = normalizaRota(value)
    if (!rotaNome || rotaNome.length < 3) continue

    // Busca motorista e placa nas 24 linhas abaixo
    let motoristaRaw: unknown = null
    let placaRaw: unknown = null
    for (let off = 2; off <= 25; off++) {
      const r = ws.getRow(row + off)
      const m = cellValue(r.getCell(col + 2))
      const p = cellValue(r.getCell(col + 3))
      if (m && !motoristaRaw) motoristaRaw = m
      if (p && !placaRaw && placaValida(p)) placaRaw = p
      if (motoristaRaw && placaRaw) break
    }

    const veiculoRaw = cellValue(ws.getRow(row).getCell(col + 2))

    const registro: RotaCozinha = {
      rota: rotaNome,
      motorista: normalizaNome(motoristaRaw),
      placa: normalizaPlaca(placaRaw),
      veiculo: veiculoRaw ? String(veiculoRaw).trim() : '—',
    }

    const chave = `${registro.rota}|${registro.motorista}|${registro.placa}`
    if (seen.has(chave)) continue
    seen.add(chave)
    rotas.push(registro)
  }

  rotas.sort((a, b) => a.rota.localeCompare(b.rota, 'pt-BR'))
  return rotas
}
