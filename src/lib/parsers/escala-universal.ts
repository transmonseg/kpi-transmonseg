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
// Nome de motorista: letras/espaços/pontos, ≥4 chars, SEM dígitos (descarta placa/loja com número).
const NOME_RE = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{3,}$/

function semAcento(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Casa por PALAVRA inteira (não substring) — "PLACA" não casa "PLACARESERVA". */
function headerCasa(txt: string, keys: string[]): boolean {
  const norm = semAcento(txt)
  return keys.some((k) => new RegExp(`(^|[^A-Z])${semAcento(k)}([^A-Z]|$)`).test(norm))
}

function detectarCabecalho(
  sheet: ExcelJS.Worksheet,
): { rowIdx: number; colMap: Map<FieldKey, number> } | null {
  for (let r = 1; r <= 5; r++) {
    const row = sheet.getRow(r)
    const colMap = new Map<FieldKey, number>()
    row.eachCell((cell, col) => {
      const txt = String(cell.value ?? '').trim()
      for (const { keys, field } of HEADER_KEYWORDS) {
        if (headerCasa(txt, keys)) {
          if (!colMap.has(field)) colMap.set(field, col)
          break
        }
      }
    })
    if (colMap.size >= 2) return { rowIdx: r, colMap }
  }
  return null
}

/** A coluna apontada como placa realmente tem placas nos dados? (≥30% das células
 *  não-vazias casam PLACA_RE). Guarda contra cabeçalho que rotulou a coluna errada. */
function placaColValida(sheet: ExcelJS.Worksheet, col: number, startRow: number): boolean {
  const maxRow = Math.min(sheet.rowCount, startRow + 40)
  let total = 0, ok = 0
  for (let r = startRow; r <= maxRow; r++) {
    const v = String(sheet.getRow(r).getCell(col).value ?? '').trim()
    if (!v) continue
    total++
    if (PLACA_RE.test(v)) ok++
  }
  return total > 0 && ok / total >= 0.3
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

/**
 * Detecta cada coluna pelo CONTEÚDO (não por posição/adjacência): placa pela regex,
 * loja pela rede reconhecida (ou maior texto médio), motorista por nome, código por
 * número curto. Robusto a qualquer ORDEM de colunas. Atribui 1 coluna por campo, na
 * ordem placa → loja → motorista → código (cada uma exclui as já usadas).
 */
function detectarColunaPorConteudo(sheet: ExcelJS.Worksheet, startRow: number): Map<FieldKey, number> {
  const maxRow = Math.min(sheet.rowCount, startRow + 40)
  const placa = new Map<number, number>()
  const rede = new Map<number, number>()
  const nome = new Map<number, number>()
  const numCurto = new Map<number, number>()
  const textLen = new Map<number, { sum: number; n: number }>()
  for (let r = startRow; r <= maxRow; r++) {
    const row = sheet.getRow(r)
    row.eachCell((cell, col) => {
      const v = String(cell.value ?? '').trim()
      if (!v) return
      const ehPlaca = PLACA_RE.test(v)
      if (ehPlaca) placa.set(col, (placa.get(col) ?? 0) + 1)
      if (inferRedeFromLoja(v) !== 'DESCONHECIDO') rede.set(col, (rede.get(col) ?? 0) + 1)
      if (!ehPlaca && NOME_RE.test(v)) nome.set(col, (nome.get(col) ?? 0) + 1)
      if (/^\d{1,4}$/.test(v)) numCurto.set(col, (numCurto.get(col) ?? 0) + 1)
      const t = textLen.get(col) ?? { sum: 0, n: 0 }; t.sum += v.length; t.n++; textLen.set(col, t)
    })
  }
  const argmax = (m: Map<number, number>, excl: Set<number>): number | null => {
    let best: number | null = null, bv = 0
    for (const [c, n] of m) if (!excl.has(c) && n > bv) { bv = n; best = c }
    return best
  }
  const colMap = new Map<FieldKey, number>()
  const usados = new Set<number>()
  const pc = argmax(placa, usados); if (pc != null) { colMap.set('placa', pc); usados.add(pc) }
  // loja: melhor por rede reconhecida; senão a coluna de maior texto médio.
  let lc = argmax(rede, usados)
  if (lc == null) {
    let best: number | null = null, bl = 0
    for (const [c, t] of textLen) if (!usados.has(c) && t.n > 0 && t.sum / t.n > bl) { bl = t.sum / t.n; best = c }
    lc = best
  }
  if (lc != null) { colMap.set('loja', lc); usados.add(lc) }
  const mc = argmax(nome, usados); if (mc != null) { colMap.set('motorista', mc); usados.add(mc) }
  const cc = argmax(numCurto, usados); if (cc != null) colMap.set('codigo', cc)
  return colMap
}

function parsearAbaXlsx(sheet: ExcelJS.Worksheet, dataAlvo?: string): LinhaEscala[] {
  const data = extrairData(sheet, dataAlvo)
  if (!data) return []

  const cabecalho = detectarCabecalho(sheet)
  const startRow = cabecalho ? cabecalho.rowIdx + 1 : 1
  // Cabeçalho só é confiável se a coluna que ele chamou de "placa" realmente tem
  // placas. Se não tem (rótulo errado / formato torto), cai pra detecção por
  // conteúdo, que acha cada coluna pelo que ela contém — em qualquer ordem.
  const cabValido = cabecalho != null && cabecalho.colMap.has('placa')
    && placaColValida(sheet, cabecalho.colMap.get('placa')!, startRow)
  let colMap: Map<FieldKey, number>
  if (cabValido) {
    colMap = cabecalho!.colMap
    // completa campos que o cabeçalho não rotulou, pelo conteúdo
    const porConteudo = detectarColunaPorConteudo(sheet, startRow)
    for (const f of ['placa', 'loja', 'motorista', 'codigo', 'carro'] as FieldKey[]) {
      if (!colMap.has(f) && porConteudo.has(f)) colMap.set(f, porConteudo.get(f)!)
    }
  } else {
    colMap = detectarColunaPorConteudo(sheet, startRow)
  }
  if (colMap.size === 0) return []
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
