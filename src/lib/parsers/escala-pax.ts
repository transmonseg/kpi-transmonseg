import ExcelJS from 'exceljs'
import type { LinhaEscala } from '@/lib/types/escala'
import { normalizaPlaca } from '@/lib/utils/placa'
import { formataDataISO } from '@/lib/utils/data-brasileira'

const SECTION_HEADERS = new Set(['SUPER PAX', 'FEIRA NOVA', 'REDE EMANUEL'])

const SKIP_VALUES = new Set([
  'FILIAL',
  'FILIAIS COM A MESMA COR, PODEM SER COMPARTILHADAS',
])

type RedeId = 'SUPER_PAX' | 'FEIRA_NOVA' | 'EMANUEL'

const HEADER_TO_REDE: Record<string, RedeId> = {
  'SUPER PAX': 'SUPER_PAX',
  'FEIRA NOVA': 'FEIRA_NOVA',
  'REDE EMANUEL': 'EMANUEL',
}

const EMANUEL_ALIAS_MAP: Record<string, string> = {
  'pedra': 'PEDRA_GUARATIBA',
  'obom mato alto': 'PEDRA_GUARATIBA',
  'o bom mato alto': 'PEDRA_GUARATIBA',
  'pedra / obom mato alto': 'PEDRA_GUARATIBA',
  'pedra / mato alto': 'PEDRA_GUARATIBA',
  'emanuel  pedra de guaratiba': 'PEDRA_GUARATIBA',
  'cachamorra': 'CACHAMORRA',
  'cachamorra (1º carro)': 'CACHAMORRA',
  'cachamorra (2º carro)': 'CACHAMORRA',
  'cachamorra / maravilha': 'CACHAMORRA',
  'cachamorra/ vila nova': 'CACHAMORRA',
  'maravilha/cachamorra': 'CACHAMORRA',
  'cachamorra/maravilha': 'CACHAMORRA',
  'emanuel cachamorra': 'CACHAMORRA',
  'maravilha': 'JARDIM_MARAVILHA',
  'maravilha / agulhas': 'JARDIM_MARAVILHA',
  'emanuel jardim maravilha': 'JARDIM_MARAVILHA',
  'santa maria': 'SANTA_MARIA',
  'santa maria  (1º viajem)': 'SANTA_MARIA',
  'santa maria (1º viajem)': 'SANTA_MARIA',
  'santa maria (2º viajem)': 'SANTA_MARIA',
  'santa maria / vila nova': 'SANTA_MARIA',
  'santa maria /cachamorra': 'SANTA_MARIA',
  'emanuel  santa maria': 'SANTA_MARIA',
  'vila nova': 'VILA_NOVA',
  'vila nova (1º carro)': 'VILA_NOVA',
  'vila nova (2º carro)': 'VILA_NOVA',
  ' vila nova': 'VILA_NOVA',
  'emanuel vila nova': 'VILA_NOVA',
  'alhambra': 'ALHAMBRA',
  'alhambra / agulhas': 'ALHAMBRA',
  'alhambra / cachamorras': 'ALHAMBRA',
  'alhambra/agulhas': 'ALHAMBRA',
  'emanuel alhambra': 'ALHAMBRA',
  'agulhas': 'AGULHAS_NEGRAS',
  'agulhas negras': 'AGULHAS_NEGRAS',
  'emanuel agulhas negras': 'AGULHAS_NEGRAS',
  'vargem grande': 'VARGEM_GRANDE',
  'emanuel vargem grande': 'VARGEM_GRANDE',
}

function normalizaEmanuel(nome: string): string {
  const key = nome.toLowerCase().trim()
  return EMANUEL_ALIAS_MAP[key] ?? nome
}

function cellVal(cell: ExcelJS.Cell | undefined): unknown {
  if (!cell) return null
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && v !== null) {
    if ('text' in v) return (v as { text: string }).text
    if ('result' in v) return (v as { result: unknown }).result
    if ('richText' in v) {
      return (v as { richText: { text: string }[] }).richText
        .map((r) => r.text)
        .join('')
    }
    if (v instanceof Date) return v
  }
  return v
}

function strVal(cell: ExcelJS.Cell | undefined): string | null {
  const v = cellVal(cell)
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function numVal(cell: ExcelJS.Cell | undefined): number | null {
  const v = cellVal(cell)
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? null : n
}

function dateVal(cell: ExcelJS.Cell | undefined): Date | null {
  const v = cellVal(cell)
  if (v instanceof Date) return v
  if (typeof v === 'string') {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
    const iso = Date.parse(v)
    if (!isNaN(iso)) return new Date(iso)
  }
  return null
}

function tabToDate(tabName: string, ano = 2026, mes = 5): string {
  const dia = parseInt(tabName.trim(), 10)
  if (isNaN(dia)) return ''
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function extractCarroOrdem(nome: string): { ordem: 1 | 2; nomeClean: string } {
  const m1 = nome.match(/\(1[ºo°]\s*CARRO\)/i)
  const m2 = nome.match(/\(2[ºo°]\s*CARRO\)/i)
  if (m2) {
    return { ordem: 2, nomeClean: nome.replace(/\s*\(2[ºo°]\s*CARRO\)/i, '').trim() }
  }
  if (m1) {
    return { ordem: 1, nomeClean: nome.replace(/\s*\(1[ºo°]\s*CARRO\)/i, '').trim() }
  }
  return { ordem: 1, nomeClean: nome }
}

function isTabDay(name: string): boolean {
  return /^\d{1,2}\s*$/.test(name.trim())
}

function detectYearMonth(wb: ExcelJS.Workbook): { ano: number; mes: number } {
  let ano = 2026
  let mes = 5
  for (const ws of wb.worksheets) {
    if (!isTabDay(ws.name)) continue
    ws.eachRow((row) => {
      for (let c = 1; c <= 12; c++) {
        const d = dateVal(row.getCell(c))
        if (d && d.getFullYear() >= 2024) {
          ano = d.getFullYear()
          mes = d.getMonth() + 1
          return
        }
      }
    })
    break
  }
  return { ano, mes }
}

export async function parseEscalaPax(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string,
): Promise<LinhaEscala[]> {
  const wb = new ExcelJS.Workbook()
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any)

  const { ano, mes } = detectYearMonth(wb)
  const result: LinhaEscala[] = []

  for (const ws of wb.worksheets) {
    if (!isTabDay(ws.name)) continue

    const tabDate = tabToDate(ws.name, ano, mes)
    if (!tabDate) continue
    if (dataAlvo && tabDate !== dataAlvo) continue

    let currentRede: RedeId | null = null
    let currentDataEntrega: string = tabDate
    let currentDataTab: string = tabDate

    ws.eachRow((row, rowNumber) => {
      const col4 = row.getCell(4)
      const raw4 = strVal(col4)

      if (raw4 === null) return

      // Section header detection
      if (SECTION_HEADERS.has(raw4)) {
        currentRede = HEADER_TO_REDE[raw4]
        if (raw4 === 'FEIRA NOVA') {
          const dateCell = row.getCell(7)
          const d = dateVal(dateCell)
          currentDataEntrega = d ? formataDataISO(d) : tabDate
          currentDataTab = currentDataEntrega
        } else {
          currentDataEntrega = tabDate
          currentDataTab = tabDate
        }
        return
      }

      if (!currentRede) return
      if (SKIP_VALUES.has(raw4)) return

      // Footer detection: col5 === 'TOTAL'
      const raw5 = strVal(row.getCell(5))
      if (raw5 === 'TOTAL') return

      // Rows that look like footers: col4 starts with 'TOTAL'
      if (raw4.toUpperCase().startsWith('TOTAL')) return

      // Data row: col4 has a non-null string (already checked above)
      const qtdCarrosRaw = strVal(row.getCell(5))
      const tipoVeiculo = strVal(row.getCell(6))
      const placaRaw = strVal(row.getCell(7))
      const paletesSuportados = numVal(row.getCell(8))
      const motoristaNome = strVal(row.getCell(9))
      const motoristaCod = strVal(row.getCell(10))
      const qtdPaletes = numVal(row.getCell(11))
      const tonelagemKg = numVal(row.getCell(12))

      const isSemPedido =
        typeof qtdCarrosRaw === 'string' &&
        qtdCarrosRaw.toUpperCase().includes('SEM PEDIDO')

      let lojaRaw = raw4
      const { ordem: carroOrdem, nomeClean } = extractCarroOrdem(lojaRaw)
      lojaRaw = nomeClean

      let lojaNomeNorm = lojaRaw
      if (currentRede === 'EMANUEL') {
        lojaNomeNorm = normalizaEmanuel(lojaRaw)
      }

      const placaNorm = isSemPedido ? '' : normalizaPlaca(placaRaw)

      const linha: LinhaEscala = {
        data: currentDataTab,
        data_entrega: currentDataEntrega,
        rede_id: currentRede,
        loja_nome_raw: lojaNomeNorm,
        loja_codigo_raw: null,
        placa_norm: placaNorm,
        placa_raw: isSemPedido ? null : placaRaw,
        motorista_nome: isSemPedido ? null : motoristaNome,
        motorista_codigo: isSemPedido ? null : motoristaCod,
        tipo_carro: tipoVeiculo,
        carro_ordem: carroOrdem,
        turno: 'TARDE',
        tipo_emissao: 'NORMAL',
        obs: isSemPedido ? 'SEM PEDIDO' : null,
        restricao: null,
        peso_kg: tonelagemKg,
        paletes: qtdPaletes ?? paletesSuportados,
        raw_row_num: rowNumber,
      }

      result.push(linha)
    })
  }

  return result
}
