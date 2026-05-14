import ExcelJS from 'exceljs'
import type { LinhaEscala } from '@/lib/types/escala'
import { normalizaPlaca } from '@/lib/utils/placa'
import { formataDataISO, proximoDiaUtil } from '@/lib/utils/data-brasileira'

const FILIAIS_D1_FIXAS = new Set(['33', '21', '30', '27', '15', '04', '18', '06', '07', '48', '13'])

const SKIP_COL4 = new Set([
  'FILIAL', 'RESUMO:', 'TIPO', 'LEGENDA:', 'QTD.', 'INÍCIO DA OPERAÇÃO DE CARGA',
])

function cellVal(cell: ExcelJS.Cell | undefined): unknown {
  if (!cell) return null
  const v = cell.value
  if (!v) return null
  if (typeof v === 'object') {
    if ('text' in v) return (v as { text: string }).text
    if ('result' in v) return (v as { result: unknown }).result
    if ('richText' in v) return (v as { richText: { text: string }[] }).richText.map((r: { text: string }) => r.text).join('')
  }
  return v
}

function extraiHora(v: unknown): { hh: number; mm: number } | null {
  if (v instanceof Date) return { hh: v.getHours(), mm: v.getMinutes() }
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

function primeiraNome(v: unknown): string | null {
  const s = toStr(v)
  if (!s) return null
  return s.split('/')[0].trim() || null
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
  if (FILIAIS_D1_FIXAS.has(cod)) {
    return formataDataISO(proximoDiaUtil(dataCarga))
  }

  if (hora && (hora.hh > 17 || (hora.hh === 17 && hora.mm > 0))) {
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

  return true
}

export async function parseEscalaZonaSul(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string
): Promise<LinhaEscala[]> {
  const wb = new ExcelJS.Workbook()
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any)

  const ws = wb.getWorksheet('MATRIZ')
  if (!ws) throw new Error('Aba MATRIZ não encontrada')

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
        currentDate = dateVal
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
    const placaRaw = toStr(r[13])
    const motoristaRaw = primeiraNome(r[18])
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

    for (const { loja, kilos } of lojas) {
      const dataEntrega = resolveDataEntrega(dataCarga, loja, hora)

      const linha: LinhaEscala = {
        data: dataISO,
        data_entrega: dataEntrega,
        rede_id: 'ZONA_SUL',
        loja_nome_raw: loja,
        loja_codigo_raw: loja,
        placa_norm: placaNorm,
        placa_raw: placaRaw,
        motorista_nome: motoristaRaw,
        motorista_codigo: codMotorista,
        tipo_carro: tipoVeiculo,
        carro_ordem: 1,
        turno,
        tipo_emissao: 'NORMAL',
        obs: null,
        restricao: null,
        peso_kg: lojas.length === 1 ? totalKilos : kilos,
        paletes: lojas.length === 1 ? totalPallets : null,
        raw_row_num: rowNumber,
      }

      results.push(linha)
    }
  })

  return results
}
