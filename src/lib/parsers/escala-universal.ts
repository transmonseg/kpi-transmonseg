import ExcelJS from 'exceljs'
import { normalizaPlaca, placaValida } from '@/lib/utils/placa'
import type { LinhaEscala } from '@/lib/types/escala'
import { inferRedeFromLoja } from './infer-rede'

type FieldKey = 'placa' | 'motorista' | 'loja' | 'codigo' | 'carro'

const HEADER_KEYWORDS: Array<{ keys: string[]; field: FieldKey }> = [
  { keys: ['PLACA', 'VEÍCULO', 'VEICULO', 'CAMINHÃO', 'CAMINHAO', 'TRUCK'], field: 'placa' },
  { keys: ['MOTORISTA', 'DRIVER', 'NOME', 'COLABORADOR', 'CHOFER'], field: 'motorista' },
  { keys: ['LOJA', 'FILIAL', 'REDE', 'ROTA', 'CLIENTE', 'DESTINO', 'LOCAL', 'ESTABELECIMENTO'], field: 'loja' },
  { keys: ['CÓDIGO', 'CODIGO', 'COD', 'CD', 'MATRÍCULA', 'MATRICULA'], field: 'codigo' },
  { keys: ['CARRO', 'TIPO CARRO', 'TIPO', 'FROTA', 'VEIC'], field: 'carro' },
]

const PLACA_RE = /[A-Z]{3}[\s\-]?\d[A-Z0-9]\d{2}/i
const DATE_CELL_RE = /(\d{2})\/(\d{2})\/(\d{4})/

function detectarCabecalho(
  sheet: ExcelJS.Worksheet,
): { rowIdx: number; colMap: Map<FieldKey, number> } | null {
  for (let r = 1; r <= 5; r++) {
    const row = sheet.getRow(r)
    const colMap = new Map<FieldKey, number>()
    row.eachCell((cell, col) => {
      const txt = String(cell.value ?? '').toUpperCase().trim()
      for (const { keys, field } of HEADER_KEYWORDS) {
        if (keys.some((k) => txt.includes(k))) {
          if (!colMap.has(field)) colMap.set(field, col)
          break
        }
      }
    })
    if (colMap.size >= 2) return { rowIdx: r, colMap }
  }
  return null
}

function extrairData(sheet: ExcelJS.Worksheet, dataAlvo?: string): string | undefined {
  if (dataAlvo) return dataAlvo
  for (let r = 1; r <= 3; r++) {
    const row = sheet.getRow(r)
    for (let c = 1; c <= 20; c++) {
      const cell = row.getCell(c)
      if (cell.value instanceof Date) {
        const d = cell.value
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
      const m = DATE_CELL_RE.exec(String(cell.value ?? ''))
      if (m) return `${m[3]}-${m[2]}-${m[1]}`
    }
  }
  return undefined
}

// Quando sem cabeçalho: detecta coluna de placa por padrão regex e infere adjacentes
function detectarColunaPorPadrao(sheet: ExcelJS.Worksheet): Map<FieldKey, number> {
  const placaMatches = new Map<number, number>()
  const maxRow = Math.min(sheet.rowCount, 20)
  for (let r = 1; r <= maxRow; r++) {
    const row = sheet.getRow(r)
    row.eachCell((cell, col) => {
      if (PLACA_RE.test(String(cell.value ?? ''))) {
        placaMatches.set(col, (placaMatches.get(col) ?? 0) + 1)
      }
    })
  }
  const colMap = new Map<FieldKey, number>()
  if (placaMatches.size > 0) {
    const melhorCol = [...placaMatches.entries()].sort((a, b) => b[1] - a[1])[0][0]
    colMap.set('placa', melhorCol)
    if (melhorCol > 1) colMap.set('loja', melhorCol - 1)
    if (melhorCol > 2) colMap.set('motorista', melhorCol - 2)
  }
  return colMap
}

function parsearAbaXlsx(sheet: ExcelJS.Worksheet, dataAlvo?: string): LinhaEscala[] {
  const data = extrairData(sheet, dataAlvo)
  if (!data) return []

  const cabecalho = detectarCabecalho(sheet)
  const colMap = cabecalho?.colMap ?? detectarColunaPorPadrao(sheet)
  if (colMap.size === 0) return []

  const startRow = cabecalho ? cabecalho.rowIdx + 1 : 1
  const linhas: LinhaEscala[] = []

  // Contador por loja: 2ª aparição da mesma loja = carro 2 (multi-entrega)
  const contagemLoja = new Map<string, number>()

  sheet.eachRow((row, rIdx) => {
    if (rIdx < startRow) return

    const get = (f: FieldKey) => {
      const col = colMap.get(f)
      return col ? String(row.getCell(col).value ?? '').trim() : ''
    }

    const placaRaw = get('placa')
    const lojaRaw = get('loja')
    const motoristaRaw = get('motorista')

    if (!placaRaw && !lojaRaw && !motoristaRaw) return

    const placaNorm = placaValida(placaRaw) ? normalizaPlaca(placaRaw) : ''
    const redeId = inferRedeFromLoja(lojaRaw)

    const lojaKey = lojaRaw.toUpperCase().trim()
    const ordemAtual = (contagemLoja.get(lojaKey) ?? 0) + 1
    contagemLoja.set(lojaKey, ordemAtual)
    const carro_ordem: 1 | 2 = ordemAtual >= 2 ? 2 : 1

    linhas.push({
      data,
      data_entrega: data,
      rede_id: redeId,
      loja_nome_raw: lojaRaw || '',
      loja_codigo_raw: get('codigo') || null,
      placa_norm: placaNorm,
      placa_raw: placaRaw || null,
      motorista_nome: motoristaRaw || null,
      motorista_codigo: null,
      tipo_carro: get('carro') || null,
      carro_ordem,
      turno: 'MANHA',
      tipo_emissao: 'NORMAL',
      obs: null,
      restricao: null,
      peso_kg: null,
      paletes: null,
      raw_row_num: rIdx,
    })
  })

  return linhas
}

async function parseXlsxUniversal(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string,
): Promise<LinhaEscala[]> {
  const wb = new ExcelJS.Workbook()
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any)

  const todas: LinhaEscala[] = []
  wb.eachSheet((sheet) => {
    todas.push(...parsearAbaXlsx(sheet, dataAlvo))
  })
  return todas
}

async function parsePdfUniversal(buffer: ArrayBuffer | Buffer, dataAlvo?: string): Promise<LinhaEscala[]> {
  const buf: Buffer = buffer instanceof ArrayBuffer ? Buffer.from(buffer) as Buffer : buffer as Buffer
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  const { text }: { text: string } = await pdfParse(buf)

  let dataDoc = dataAlvo
  if (!dataDoc) {
    const mData = DATE_CELL_RE.exec(text)
    if (mData) dataDoc = `${mData[3]}-${mData[2]}-${mData[1]}`
  }
  if (!dataDoc) return []

  const linhas: LinhaEscala[] = []
  const rows = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  for (let i = 0; i < rows.length; i++) {
    const placaMatch = PLACA_RE.exec(rows[i])
    if (!placaMatch) continue

    const placaRaw = placaMatch[0]
    const placaNorm = normalizaPlaca(placaRaw)

    const anterior = i > 0 ? rows[i - 1] : ''
    const posterior = i < rows.length - 1 ? rows[i + 1] : ''

    const motorista = /^[A-ZÁÉÍÓÚÃÕÇ\s]{4,}$/.test(anterior) ? anterior : null
    const loja = motorista ? posterior : anterior

    linhas.push({
      data: dataDoc,
      data_entrega: dataDoc,
      rede_id: 'DESCONHECIDO',
      loja_nome_raw: loja || '',
      loja_codigo_raw: null,
      placa_norm: placaNorm,
      placa_raw: placaRaw,
      motorista_nome: motorista,
      motorista_codigo: null,
      tipo_carro: null,
      carro_ordem: 1,
      turno: 'MANHA',
      tipo_emissao: 'NORMAL',
      obs: null,
      restricao: null,
      peso_kg: null,
      paletes: null,
      raw_row_num: i + 1,
    })
  }

  return linhas
}

export async function parseEscalaUniversal(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string,
  formato?: 'xlsx' | 'pdf',
): Promise<LinhaEscala[]> {
  const fmt = formato ?? 'xlsx'
  if (fmt === 'pdf') {
    return parsePdfUniversal(buffer, dataAlvo)
  }
  return parseXlsxUniversal(buffer, dataAlvo)
}
