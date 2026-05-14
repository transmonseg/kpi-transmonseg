import ExcelJS from 'exceljs'

export type StatusRota = 'completa' | 'sem-placa' | 'sem-motorista' | 'vazia'

export type RotaCozinha = {
  rota: string
  motorista: string
  placa: string
  veiculo: string
  status: StatusRota
  duplicada: boolean
}

export type EstatisticasCozinha = {
  total: number
  completas: number
  semPlaca: number
  semMotorista: number
  vazias: number
  duplicadas: number
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

const SEM_VALOR = '—'

function normalizaPlaca(valor: unknown): string {
  if (valor === null || valor === undefined) return SEM_VALOR
  const s = String(valor).toUpperCase().trim().replace(/[^A-Z0-9]/g, '')
  if (!s) return SEM_VALOR
  if (s.length === 7 && PLACA_REGEX.test(s)) return `${s.slice(0, 3)}-${s.slice(3)}`
  return s || SEM_VALOR
}

function placaValida(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false
  const t = String(valor).toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (PLACA_INVALIDA.has(t)) return false
  if (t.length !== 7) return false
  return PLACA_REGEX.test(t)
}

function normalizaNome(valor: unknown): string {
  if (valor === null || valor === undefined) return SEM_VALOR
  const s = String(valor).trim().replace(/\s+/g, ' ')
  if (!s) return SEM_VALOR
  return s
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function normalizaRota(valor: string): string {
  return valor.replace(/ROTA:/i, '').trim().toUpperCase().replace(/\s+/g, ' ')
}

function normalizaVeiculo(valor: unknown): string {
  if (valor === null || valor === undefined) return SEM_VALOR
  const s = String(valor).trim().replace(/\s+/g, ' ')
  if (!s || s === 'VEÍCULO :' || s === 'VEICULO :') return SEM_VALOR
  return s
}

function classificaStatus(motorista: string, placa: string): StatusRota {
  const semMot = motorista === SEM_VALOR
  const semPl = placa === SEM_VALOR
  if (semMot && semPl) return 'vazia'
  if (semMot) return 'sem-motorista'
  if (semPl) return 'sem-placa'
  return 'completa'
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

export async function parseCozinha(
  buffer: ArrayBuffer | Buffer
): Promise<RotaCozinha[]> {
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
  const contagem = new Map<string, number>()

  for (const { row, col, value } of celulasRota) {
    const rotaNome = normalizaRota(value)
    if (!rotaNome || rotaNome.length < 3) continue

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

    const motorista = normalizaNome(motoristaRaw)
    const placa = normalizaPlaca(placaRaw)

    const chave = `${rotaNome}|${motorista}|${placa}`
    if (chave === `${rotaNome}|${SEM_VALOR}|${SEM_VALOR}`) {
      // permite múltiplas linhas vazias da mesma rota (caso COPACABANA 02)
    }

    contagem.set(rotaNome, (contagem.get(rotaNome) ?? 0) + 1)

    rotas.push({
      rota: rotaNome,
      motorista,
      placa,
      veiculo: normalizaVeiculo(veiculoRaw),
      status: classificaStatus(motorista, placa),
      duplicada: false,
    })
  }

  // Marca duplicadas
  for (const r of rotas) {
    if ((contagem.get(r.rota) ?? 0) > 1) r.duplicada = true
  }

  // Dedup exata (mesma rota+motorista+placa)
  const seen = new Set<string>()
  const final: RotaCozinha[] = []
  for (const r of rotas) {
    const k = `${r.rota}|${r.motorista}|${r.placa}`
    if (seen.has(k)) continue
    seen.add(k)
    final.push(r)
  }

  final.sort((a, b) => a.rota.localeCompare(b.rota, 'pt-BR'))
  return final
}

export function calcularEstatisticas(rotas: RotaCozinha[]): EstatisticasCozinha {
  return {
    total: rotas.length,
    completas: rotas.filter(r => r.status === 'completa').length,
    semPlaca: rotas.filter(r => r.status === 'sem-placa').length,
    semMotorista: rotas.filter(r => r.status === 'sem-motorista').length,
    vazias: rotas.filter(r => r.status === 'vazia').length,
    duplicadas: new Set(rotas.filter(r => r.duplicada).map(r => r.rota)).size,
  }
}
