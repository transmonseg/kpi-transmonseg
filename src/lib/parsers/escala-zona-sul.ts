import ExcelJS from 'exceljs'
import type { LinhaEscala } from '@/lib/types/escala'
import { normalizaPlaca } from '@/lib/utils/placa'
import { formataDataISO, proximoDiaUtil } from '@/lib/utils/data-brasileira'
import { FILIAIS_ZONA_SUL } from '@/lib/kpi/zona-sul-base'

const FILIAL_NOME: Map<string, string> = new Map(
  FILIAIS_ZONA_SUL.map(f => [String(f.numero).trim(), f.nome])
)

const FILIAIS_D1_FIXAS = new Set(['33', '21', '30', '27', '15', '04', '18', '06', '07', '48', '13'])

const SKIP_COL4 = new Set([
  'FILIAL', 'RESUMO:', 'TIPO', 'LEGENDA:', 'QTD.', 'INÍCIO DA OPERAÇÃO DE CARGA',
])

export function normalizaFilialCod(cod: string): string {
  // zero-pad para 2 dígitos se for 1 dígito numérico
  const trimmed = cod.trim()
  if (/^\d$/.test(trimmed)) return `0${trimmed}`
  // Normaliza "MEGA BOX 01" → "MEGA BOX 1", "MEGA BOX 02" → "MEGA BOX 2"
  // para evitar dupla contagem (cadastro Zona Sul aceita ambos os formatos).
  // Aceita sufixo opcional de bairro após o número, com hífen/en-dash/em-dash:
  //   "MEGA BOX 01 - Olaria" → "MEGA BOX 1 - Olaria"
  //   "MEGA BOX 01 — Olaria" → "MEGA BOX 1 — Olaria"
  const megaBoxMatch = trimmed.match(/^MEGA\s+BOX\s+0*(\d+)(\s*[-–—]\s*.*)?$/i)
  if (megaBoxMatch) {
    const num = megaBoxMatch[1]
    const sufixo = megaBoxMatch[2] ?? ''
    return `MEGA BOX ${num}${sufixo}`
  }
  return trimmed
}

export function isMegaBoxLoja(lojaNomeRaw: string | null | undefined): boolean {
  if (!lojaNomeRaw) return false
  return /MEGA\s+BOX/i.test(lojaNomeRaw)
}

function cellVal(cell: ExcelJS.Cell | undefined): unknown {
  if (!cell) return null
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    if ('text' in v) return (v as { text: string }).text
    if ('result' in v) return (v as { result: unknown }).result
    if ('richText' in v) return (v as { richText: { text: string }[] }).richText.map((r: { text: string }) => r.text).join('')
  }
  return v
}

function extraiHora(v: unknown): { hh: number; mm: number } | null {
  if (v instanceof Date) {
    // Excel pure-time serials are represented as UTC dates near 1900-01-01.
    // Use UTC methods to avoid local timezone skewing the extracted hour.
    const isExcelSerial = v.getUTCFullYear() <= 1900
    return isExcelSerial
      ? { hh: v.getUTCHours(), mm: v.getUTCMinutes() }
      : { hh: v.getHours(), mm: v.getMinutes() }
  }
  if (typeof v === 'string') {
    const m = v.match(/^(\d+):(\d+)/)
    if (m) return { hh: Number(m[1]), mm: Number(m[2]) }
  }
  return null
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function ultimoNome(v: unknown): string | null {
  const s = toStr(v)
  if (!s) return null
  const parts = s.split('/')
  return parts[parts.length - 1].trim() || null
}

function resolveDataEntrega(
  dataCarga: Date,
  filialStr: string | null,
  hora: { hh: number; mm: number } | null
): string {
  if (!filialStr) return formataDataISO(dataCarga)

  const isMegaBox = filialStr.toUpperCase().startsWith('MEGA BOX')
  if (isMegaBox) return formataDataISO(dataCarga)

  const cod = filialStr.trim()
  // Normaliza para 2 dígitos pra casar com os códigos no Set mesmo quando
  // o Excel armazena o número sem zero à esquerda (ex: "4" deve casar com "04").
  const codNorm = /^\d$/.test(cod) ? `0${cod}` : cod
  if (FILIAIS_D1_FIXAS.has(cod) || FILIAIS_D1_FIXAS.has(codNorm)) {
    return formataDataISO(proximoDiaUtil(dataCarga))
  }

  // Érica (vídeo): "os caminhões que são carregados às 17 horas, eles são
  // caminhões que vão ser carregados e que sairão no primeiro horário do
  // dia seguinte". Inclui 17:00 exatas.
  if (hora && hora.hh >= 17) {
    return formataDataISO(proximoDiaUtil(dataCarga))
  }

  return formataDataISO(dataCarga)
}

function infereTurno(hora: { hh: number; mm: number } | null): 'MANHA' | 'TARDE' {
  if (!hora) return 'MANHA'
  return hora.hh < 12 ? 'MANHA' : 'TARDE'
}

function isDataRow(r: (unknown)[]): boolean {
  const col2 = r[1]
  const col4 = r[3]

  if (col2 === null || col2 === undefined) return false

  const horaOk = extraiHora(col2) !== null
  if (!horaOk) return false

  if (col4 === null || col4 === undefined) return false
  const col4Str = String(col4).trim()
  if (SKIP_COL4.has(col4Str)) return false
  if (col4Str === 'CARREGAMENTO DIÁRIO') return false

  // Rows de aviso em sábados: o XLSX intercala linhas com texto "Atenção, Filial: X..."
  // repetido nas colunas 13-20. Mesma hora/loja/peso da viagem real anterior, mas
  // sem placa/motorista válidos. Detecta pelo texto na coluna 13 (tipo_carro).
  const col13 = r[12]
  if (typeof col13 === 'string' && /aten[cç]/i.test(col13)) return false

  return true
}

// ─── Formato compacto (Plan1 / pares de linhas) ──────────────────────────────

function isDataRowCompacto(r: unknown[]): boolean {
  const c8 = r[7]
  if (c8 === null || c8 === undefined) return false
  if (typeof c8 === 'number') return true
  if (typeof c8 === 'string') return c8.trim().length <= 12
  return false
}

function detectaFormatoCompacto(ws: ExcelJS.Worksheet): boolean {
  if (ws.rowCount < 1) return false
  const row1 = ws.getRow(1)
  const c1 = cellVal(row1.getCell(1))
  const c2 = cellVal(row1.getCell(2))
  const c3 = cellVal(row1.getCell(3))
  const c10 = cellVal(row1.getCell(10))
  return (
    c1 instanceof Date &&
    (c2 === null || c2 === undefined) &&
    typeof c3 === 'number' &&
    typeof c10 === 'string' && c10.length >= 6
  )
}

function filialKey(num: number): { nomeKey: string; d1Key: string } {
  const nomeKey = String(num)
  const d1Key = num < 10 ? `0${num}` : String(num)
  return { nomeKey, d1Key }
}

function parseFormatoCompacto(ws: ExcelJS.Worksheet, dataAlvo?: string): LinhaEscala[] {
  const results: LinhaEscala[] = []

  const [year, month, day] = (dataAlvo ?? '').split('-').map(Number)
  const dataCargaDate =
    year && month && day ? new Date(year, month - 1, day) : new Date()
  const dataISO = formataDataISO(dataCargaDate)

  ws.eachRow((row, rowNumber) => {
    const r: unknown[] = []
    for (let c = 1; c <= 15; c++) r.push(cellVal(row.getCell(c)))

    if (!isDataRowCompacto(r)) return

    const filialNum = r[2]
    if (typeof filialNum !== 'number') return
    const { nomeKey, d1Key } = filialKey(Math.round(filialNum))

    const horaVal = r[0]
    const pesoKg = toNum(r[3])
    const tipoCarroRaw = r[7]
    const paletes = toNum(r[8])
    const placaRaw = toStr(r[9])
    const motoristaRaw = toStr(r[13])
    const motoristaCod = toStr(r[14])

    const hora = extraiHora(horaVal)
    const placaNorm = normalizaPlaca(placaRaw)
    const turno = infereTurno(hora)

    let tipoCarro: string | null = null
    if (typeof tipoCarroRaw === 'string') tipoCarro = tipoCarroRaw.trim() || null
    else if (typeof tipoCarroRaw === 'number') tipoCarro = String(tipoCarroRaw)

    const nomeCompleto = FILIAL_NOME.get(nomeKey) ?? `Filial ${d1Key}`
    const dataEntrega = resolveDataEntrega(dataCargaDate, d1Key, hora)

    results.push({
      data: dataISO,
      data_entrega: dataEntrega,
      rede_id: 'ZONA_SUL',
      sub_rede: isMegaBoxLoja(nomeCompleto) ? 'MEGA_BOX' : null,
      loja_nome_raw: nomeCompleto,
      loja_codigo_raw: d1Key,
      placa_norm: placaNorm,
      placa_raw: placaRaw,
      motorista_nome: ultimoNome(motoristaRaw),
      motorista_codigo: motoristaCod,
      tipo_carro: tipoCarro,
      carro_ordem: 1,
      turno,
      tipo_emissao: 'NORMAL',
      obs: null,
      restricao: null,
      peso_kg: pesoKg,
      paletes,
      raw_row_num: rowNumber,
    })
  })

  return results
}

// ─── Parser principal ─────────────────────────────────────────────────────────

export async function parseEscalaZonaSul(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string
): Promise<LinhaEscala[]> {
  const wb = new ExcelJS.Workbook()
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any)

  const ws = wb.getWorksheet('MATRIZ')
  if (!ws) {
    // Tenta formato compacto (Plan1 / pares de linhas sem cabeçalho MATRIZ)
    const firstWs = wb.worksheets[0]
    if (firstWs && detectaFormatoCompacto(firstWs)) {
      return parseFormatoCompacto(firstWs, dataAlvo)
    }
    throw new Error('Aba MATRIZ não encontrada')
  }

  const results: LinhaEscala[] = []
  let currentDate: Date | null = null

  ws.eachRow((row, rowNumber) => {
    const r: unknown[] = []
    for (let c = 1; c <= 22; c++) {
      r.push(cellVal(row.getCell(c)))
    }

    // r is 0-indexed internally but spec uses 1-based — r[0] = col1, r[1] = col2 etc.

    if (r[9] === 'CARREGAMENTO DIÁRIO') {
      // date is in col 18 (1-based) = r[17]
      const dateVal = r[17]
      if (dateVal instanceof Date) {
        // ExcelJS returns UTC midnight — normalize to local date to avoid off-by-one in UTC-3
        currentDate = new Date(dateVal.getUTCFullYear(), dateVal.getUTCMonth(), dateVal.getUTCDate())
      }
      return
    }

    if (r[9] === 'OPERAÇÃO MATRIZ  -  HTF CEASA') return
    if (r[1] === 'INÍCIO DA OPERAÇÃO DE CARGA') return
    if (r[1] === 'RESUMO:') return

    if (!currentDate) return
    if (!isDataRow(r)) return

    const dataCarga = currentDate
    const dataISO = formataDataISO(dataCarga)

    if (dataAlvo && dataISO !== dataAlvo) return

    const hora = extraiHora(r[1])

    const loja1Raw = toStr(r[3])
    const kilos1 = toNum(r[4])
    const loja2Raw = toStr(r[5])
    const kilos2 = toNum(r[6])
    const loja3Raw = toStr(r[7])
    const kilos3 = toNum(r[8])
    const totalKilos = toNum(r[9])
    const totalPallets = toNum(r[10])
    const tipoVeiculo = toStr(r[12])
    const placaRaw = toStr(r[14])
    const motoristaRaw = ultimoNome(r[18])
    const codMotorista = toStr(r[19])

    const placaNorm = normalizaPlaca(placaRaw)
    const turno = infereTurno(hora)

    const lojas: { loja: string; kilos: number | null }[] = []

    if (loja1Raw) {
      lojas.push({ loja: loja1Raw, kilos: kilos1 })
    }
    if (loja2Raw) {
      lojas.push({ loja: loja2Raw, kilos: kilos2 })
    }
    if (loja3Raw) {
      lojas.push({ loja: loja3Raw, kilos: kilos3 })
    }

    if (lojas.length === 0) return

    lojas.forEach(({ loja, kilos }, posIdx) => {
      const dataEntrega = resolveDataEntrega(dataCarga, loja, hora)

      const lojaNum = parseInt(loja.trim(), 10)
      const lojaKey = !isNaN(lojaNum) ? String(lojaNum) : loja.trim()
      const lojaCodNorm = normalizaFilialCod(lojaKey)
      const nomeCompleto = FILIAL_NOME.get(lojaKey) ?? loja

      const linha: LinhaEscala = {
        data: dataISO,
        data_entrega: dataEntrega,
        rede_id: 'ZONA_SUL',
        sub_rede: isMegaBoxLoja(loja) || isMegaBoxLoja(nomeCompleto) ? 'MEGA_BOX' : null,
        loja_nome_raw: nomeCompleto,
        loja_codigo_raw: lojaCodNorm,
        placa_norm: placaNorm,
        placa_raw: placaRaw,
        motorista_nome: motoristaRaw,
        motorista_codigo: codMotorista,
        tipo_carro: tipoVeiculo,
        carro_ordem: posIdx === 0 ? 1 : 2,
        turno,
        tipo_emissao: 'NORMAL',
        obs: null,
        restricao: null,
        peso_kg: lojas.length === 1 ? totalKilos : kilos,
        paletes: lojas.length === 1 ? totalPallets : null,
        raw_row_num: rowNumber,
      }

      results.push(linha)
    })
  })

  // Regra Zona Sul: mesma placa na mesma loja = 1 carro. Mantém a entrega de
  // MENOR posição (1ª entrega = "dono" tem prioridade sobre 2ª/3ª = "carona").
  // carro_ordem final: 1 = dono (1ª entrega), 2 = carona (só passa pela loja).
  const dedup = new Map<string, LinhaEscala>()
  for (const l of results) {
    const key = l.placa_norm
      ? `${l.loja_codigo_raw}|${l.placa_norm}`
      : `${l.loja_codigo_raw}|sempl|${l.raw_row_num}`
    const prev = dedup.get(key)
    if (!prev || l.carro_ordem < prev.carro_ordem) dedup.set(key, l)
  }
  return [...dedup.values()]
}
