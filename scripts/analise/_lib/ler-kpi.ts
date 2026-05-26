/**
 * Leitor unificado de KPIs (manual ou gerado).
 *
 * O KPI tem header de 3-4 linhas:
 *   R1: "RELATÓRIO KPI - <Rede>" + data
 *   R2: nomes de turno repetidos por coluna ("PRINCESA 1º CARRO" etc.)
 *   R3: cabeçalho de colunas ("REDES / FILIAIS | MOTORISTA | COD | PLACA | ...")
 *   R4: (linha vazia)
 *   R5+: dados
 *
 * Antes os comparadores começavam em r=1 e o header virava "loja" — caso
 * GUANABARA dia 19 mostrou linha "RELATORIOKPIGUANABARATERCAFEIRA19DEMAIODE2026".
 *
 * Este util encontra a linha de cabeçalho real e começa a leitura logo abaixo.
 */
import ExcelJS from 'exceljs'

export interface KpiLinha {
  loja: string
  mot1: string; placa1: string; sc1: string; chd1: string; sl1: string; tempo1: string
  mot2: string; placa2: string; sc2: string; chd2: string; sl2: string; tempo2: string
}

export function cvCell(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return ''
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'object' && v !== null && 'richText' in v) return (v as any).richText.map((r: any) => r.text).join('').trim()
  if (typeof v === 'object' && v !== null && 'text' in v) return String((v as any).text).trim()
  return String(v).trim()
}

export function fmtKpiCell(v: unknown): string {
  if (v == null) return '---'
  if (typeof v === 'object' && v !== null && 'result' in v) return fmtKpiCell((v as any).result)
  if (v instanceof Date) {
    // BR mascarado como UTC (convenção do sistema)
    const h = v.getUTCHours()
    const m = v.getUTCMinutes()
    if (h === 0 && m === 0 && v.getUTCFullYear() <= 1900) return '---' // Excel zero date sem hora
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const total = Math.round(v * 86400)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (typeof v === 'string') {
    const s = v.trim()
    if (s.startsWith('SEM')) return 'SEM'
    if (s.startsWith('RASTREADOR')) return 'RASTREADOR'
    if (s.startsWith('NÃO') || s.startsWith('NAO')) return 'NAO_FOI'
    if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5)
    return s.length === 0 ? '---' : s
  }
  return '---'
}

interface ColMap {
  loja: number; mot: number; placa: number
  sc: number; chd: number; sl: number; tempo: number
  // 2º carro (opcional, manuais ARMAZEM mensais têm)
  mot2?: number; placa2?: number
  sc2?: number; chd2?: number; sl2?: number; tempo2?: number
}

/**
 * Detecta linha do cabeçalho + posições das colunas por nome.
 * Diferentes manuais têm layouts distintos:
 *  - ARMAZEM mensal: REDES | MOTORISTA | COD | PLACA | SC | CHD | SL
 *  - ZONA SUL: REDES | MOTORISTA | PLACA | SC | CHD | SL (sem COD)
 *  - Gerado pelo sistema: REDES | MOTORISTA | COD | PLACA | SC | CHD | SL
 */
function detectarLayout(ws: ExcelJS.Worksheet): { primeiraLinha: number; cols: ColMap } | null {
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const row = ws.getRow(r)
    const c1 = cvCell(row.getCell(1)).toUpperCase()
    if (!(c1.includes('REDES') && c1.includes('FILIAIS'))) continue
    // Mapeia colunas por nome
    const cols: Partial<ColMap> = { loja: 1 }
    let segundoCarro = false
    for (let c = 2; c <= 25; c++) {
      const h = cvCell(row.getCell(c)).toUpperCase().trim()
      if (!h) continue
      const target = segundoCarro ? '2' : '1'
      if (h === 'MOTORISTA') {
        if (cols.mot && !segundoCarro) { segundoCarro = true; (cols as any)[`mot2`] = c }
        else if (segundoCarro) (cols as any)[`mot2`] = c
        else cols.mot = c
      } else if (h === 'PLACA') {
        if (segundoCarro) (cols as any)[`placa2`] = c
        else cols.placa = c
      } else if (h.includes('SAIDA CD') || h === 'SAIDA') {
        if (segundoCarro) (cols as any)[`sc2`] = c
        else cols.sc = c
      } else if (h.includes('CHD LOJA') || h === 'CHD') {
        if (segundoCarro) (cols as any)[`chd2`] = c
        else cols.chd = c
      } else if (h.includes('SAIDA LOJA') || h === 'SAIDA LOJA 1' || h === 'SAIDA LOJA 2') {
        if (segundoCarro) (cols as any)[`sl2`] = c
        else cols.sl = c
      } else if (h.includes('TEMPO')) {
        if (segundoCarro) (cols as any)[`tempo2`] = c
        else cols.tempo = c
      }
    }
    // Próximo r não-vazio é primeira linha
    let primeiraLinha = r + 1
    for (let r2 = r + 1; r2 <= Math.min(r + 5, ws.rowCount); r2++) {
      const c = cvCell(ws.getRow(r2).getCell(1))
      if (c && !c.includes('REDES')) { primeiraLinha = r2; break }
    }
    if (cols.sc && cols.chd && cols.sl) {
      return { primeiraLinha, cols: cols as ColMap }
    }
  }
  return null
}

/**
 * Lê um KPI (gerado ou manual). Aceita string (path) ou aba específica.
 * Pula header automaticamente.
 */
export async function lerKpi(path: string, sheetName?: string): Promise<KpiLinha[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0]
  if (!ws) return []

  const layout = detectarLayout(ws)
  if (!layout) return []
  const { primeiraLinha: start, cols } = layout
  const out: KpiLinha[] = []

  for (let r = start; r <= Math.min(start + 200, ws.rowCount); r++) {
    const row = ws.getRow(r)
    const loja = cvCell(row.getCell(cols.loja))
    if (!loja) continue
    if (loja.toUpperCase().startsWith('RELATÓRIO') || loja.toUpperCase().startsWith('RELATORIO')) continue
    if (loja.toUpperCase().includes('REDES') && loja.toUpperCase().includes('FILIAIS')) continue

    out.push({
      loja,
      mot1: cvCell(row.getCell(cols.mot)),
      placa1: cvCell(row.getCell(cols.placa)),
      sc1: fmtKpiCell(row.getCell(cols.sc).value),
      chd1: fmtKpiCell(row.getCell(cols.chd).value),
      sl1: fmtKpiCell(row.getCell(cols.sl).value),
      tempo1: cols.tempo ? fmtKpiCell(row.getCell(cols.tempo).value) : '',
      mot2: cols.mot2 ? cvCell(row.getCell(cols.mot2)) : '',
      placa2: cols.placa2 ? cvCell(row.getCell(cols.placa2)) : '',
      sc2: cols.sc2 ? fmtKpiCell(row.getCell(cols.sc2).value) : '',
      chd2: cols.chd2 ? fmtKpiCell(row.getCell(cols.chd2).value) : '',
      sl2: cols.sl2 ? fmtKpiCell(row.getCell(cols.sl2).value) : '',
      tempo2: cols.tempo2 ? fmtKpiCell(row.getCell(cols.tempo2).value) : '',
    })
  }
  return out
}

/** Lê o KPI e retorna um Map indexado pela loja (sem normalização). */
export async function lerKpiMap(path: string, sheetName?: string): Promise<Map<string, KpiLinha>> {
  const linhas = await lerKpi(path, sheetName)
  return new Map(linhas.map(l => [l.loja, l]))
}

/** Normaliza nome de loja pra matching cross-formato (ex: "Gb - Eng. De Dentro - Filial 1" ↔ "GB ENG DE DENTRO FILIAL 1"). */
export function normLoja(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\bGB\b/g, '')
    .replace(/\bFILIAL\b/g, '')
    .replace(/\bLOJA\b/g, '')
    .replace(/[^A-Z0-9]/g, '')
}
