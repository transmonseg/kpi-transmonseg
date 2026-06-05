import ExcelJS from 'exceljs'
import type { LinhaEscala } from '@/lib/types/escala'
import { normalizaPlaca } from '@/lib/utils/placa'

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
  if (v instanceof Date) {
    // ExcelJS returns UTC midnight — normalize to local date to avoid off-by-one in UTC-3
    return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())
  }
  if (typeof v === 'string') {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
    const iso = Date.parse(v)
    if (!isNaN(iso)) return new Date(iso)
  }
  return null
}

export function tabToDate(tabName: string, ano: number, mes: number): string {
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
  return /^\d{1,3}\s*$/.test(name.trim())
}

function detectYearMonth(wb: ExcelJS.Workbook): { ano: number; mes: number } {
  // Default to current date so files processed in any month work correctly
  const now = new Date()
  let ano = now.getFullYear()
  let mes = now.getMonth() + 1
  for (const ws of wb.worksheets) {
    if (!isTabDay(ws.name)) continue
    // Pega a PRIMEIRA data sã (2024–2100) e para. Antes, sem teto de ano e pegando
    // a ÚLTIMA data, uma célula lixo (ex: virava ano 5427) sobrescrevia ano/mês →
    // tabToDate gerava "5427-01-05" e nenhuma seção batia a data-alvo (0 linhas).
    let achou = false
    ws.eachRow((row) => {
      if (achou) return
      for (let c = 1; c <= 12; c++) {
        const d = dateVal(row.getCell(c))
        if (d && d.getFullYear() >= 2024 && d.getFullYear() <= 2100) {
          ano = d.getFullYear()
          mes = d.getMonth() + 1
          achou = true
          return
        }
      }
    })
    break
  }
  return { ano, mes }
}

// Mapa de colunas (1-based) por campo. A ordem das colunas MOTORISTA/PLACA/CÓDIGO
// mudou entre versões da escala (ex: junho passou MOTORISTA p/ col7 e PLACA p/ col9,
// invertendo a ordem antiga PLACA=col7/MOTORISTA=col9). Em vez de fixar a posição,
// lemos pelos RÓTULOS do cabeçalho — robusto a qualquer ordem.
type ColMap = {
  filial: number; qtd: number; tipo: number
  motorista: number | null; codigo: number | null; placa: number | null
  paletesSup: number | null; qtdPaletes: number | null; tonelagem: number | null
}

// Layout antigo (fallback quando não há linha de cabeçalho FILIAL): PLACA=7, MOTORISTA=9.
const DEFAULT_COLMAP: ColMap = {
  filial: 4, qtd: 5, tipo: 6, placa: 7, paletesSup: 8, motorista: 9, codigo: 10,
  qtdPaletes: 11, tonelagem: 12,
}

function normLabel(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Constrói o mapa a partir de uma linha de cabeçalho ("FILIAL | QTD | TIPO | ...").
// Campos não encontrados ficam null (lê null). Sem coluna FILIAL → não é cabeçalho.
function buildColMap(row: ExcelJS.Row): ColMap | null {
  const m: ColMap = { filial: 4, qtd: 5, tipo: 6, motorista: null, codigo: null, placa: null, paletesSup: null, qtdPaletes: null, tonelagem: null }
  let achouFilial = false
  for (let c = 3; c <= 16; c++) {
    const lbl = normLabel(strVal(row.getCell(c)) ?? '')
    if (!lbl) continue
    if (lbl === 'FILIAL' || lbl === 'FILIAIS') { m.filial = c; achouFilial = true }
    else if (lbl === 'QTD' || lbl === 'QUANTIDADE') m.qtd = c
    else if (lbl.startsWith('TIPO')) m.tipo = c
    else if (lbl === 'MOTORISTA' || lbl === 'NOME') m.motorista = c
    else if (lbl === 'CODIGO' || lbl === 'COD') m.codigo = c
    else if (lbl === 'PLACA' || lbl === 'PLACAS') m.placa = c
    else if (lbl.includes('SUPORTAD')) m.paletesSup = c
    else if (lbl === 'TONELAGEM' || lbl.includes('PESO') || lbl === 'KG') m.tonelagem = c
  }
  return achouFilial ? m : null
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

  // When dataAlvo is specified and no tab has an exact date match, fall back to
  // the latest available tab date that is <= dataAlvo (e.g. Friday's scale used
  // for Saturday/Monday KPI). Collect all tab dates first.
  let efectivaDataAlvo: string | undefined = dataAlvo
  if (dataAlvo) {
    // Phase 1: find dates present in the file
    const tabDates: string[] = []
    for (const ws of wb.worksheets) {
      if (!isTabDay(ws.name)) continue
      const td = tabToDate(ws.name, ano, mes)
      if (td) tabDates.push(td)
    }
    const hasExact = tabDates.includes(dataAlvo)
    if (!hasExact && tabDates.length > 0) {
      // Use the latest date that is <= dataAlvo as proxy
      const candidates = tabDates.filter(d => d <= dataAlvo).sort()
      if (candidates.length > 0) {
        efectivaDataAlvo = candidates[candidates.length - 1]
      }
      // If all tab dates are > dataAlvo keep efectivaDataAlvo = dataAlvo (no match → 0 lines)
    }
  }

  for (const ws of wb.worksheets) {
    if (!isTabDay(ws.name)) continue

    const tabDate = tabToDate(ws.name, ano, mes)
    if (!tabDate) continue

    let currentRede: RedeId | null = null
    let currentDataEntrega: string = tabDate
    let currentDataTab: string = tabDate
    // Só processamos abas DIA (isTabDay) — a data da ABA é a fonte de verdade.
    // A data no cabeçalho da seção é metadado e às vezes vem DESATUALIZADA (ex:
    // junho dia 05: SUPER PAX com 06-05 mas FEIRA NOVA/EMANUEL com 06-01 stale),
    // o que fazia o parser PULAR essas redes. Não usamos mais a data do cabeçalho
    // pra decidir o skip — usamos a data da aba.
    let skipSection = false
    let colMap: ColMap = DEFAULT_COLMAP

    ws.eachRow((row, rowNumber) => {
      const col4 = row.getCell(4)
      const raw4 = strVal(col4)

      if (raw4 === null) return

      // Section header detection
      if (SECTION_HEADERS.has(raw4)) {
        currentRede = HEADER_TO_REDE[raw4]
        // Data da ABA é autoritativa (ver nota acima). Ignora data stale do cabeçalho.
        currentDataEntrega = tabDate
        currentDataTab = tabDate
        colMap = DEFAULT_COLMAP // reset; será atualizado pela linha de cabeçalho da seção
        skipSection = efectivaDataAlvo != null && tabDate !== efectivaDataAlvo
        return
      }

      if (skipSection) return
      if (!currentRede) return

      // Linha de cabeçalho de colunas ("FILIAL | QTD | TIPO | MOTORISTA | CÓDIGO |
      // PLACA" ou variantes com ordem trocada) → atualiza o mapa de colunas e segue.
      const novoMap = buildColMap(row)
      if (novoMap) { colMap = novoMap; return }

      if (SKIP_VALUES.has(raw4)) return

      // Footer detection: col5 === 'TOTAL'
      const raw5 = strVal(row.getCell(5))
      if (raw5 === 'TOTAL') return

      // Rows that look like footers: col4 starts with 'TOTAL'
      if (raw4.toUpperCase().startsWith('TOTAL')) return

      // Data row: lê cada campo pela coluna mapeada do cabeçalho (robusto a ordem).
      const cel = (c: number | null) => (c ? row.getCell(c) : undefined)
      const qtdCarrosRaw = strVal(cel(colMap.qtd))
      const tipoVeiculo = strVal(cel(colMap.tipo))
      const placaRaw = strVal(cel(colMap.placa))
      const paletesSuportados = numVal(cel(colMap.paletesSup))
      const motoristaNome = strVal(cel(colMap.motorista))
      const motoristaCod = strVal(cel(colMap.codigo))
      const qtdPaletes = numVal(cel(colMap.qtdPaletes))
      const tonelagemKg = numVal(cel(colMap.tonelagem))

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

      // If a proxy date was used (file had no exact match for dataAlvo),
      // report data_entrega as the requested target date so DB queries find it.
      const dataEntregaFinal =
        dataAlvo && efectivaDataAlvo !== dataAlvo ? dataAlvo : currentDataEntrega
      const dataTabFinal =
        dataAlvo && efectivaDataAlvo !== dataAlvo ? dataAlvo : currentDataTab

      const linha: LinhaEscala = {
        data: dataTabFinal,
        data_entrega: dataEntregaFinal,
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
