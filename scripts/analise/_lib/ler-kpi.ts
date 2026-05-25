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

/**
 * Detecta a linha do cabeçalho ("REDES / FILIAIS") e retorna o índice da
 * primeira linha de dados (depois da linha de cabeçalho + linha em branco).
 * Retorna null se não achar (formato desconhecido).
 */
function detectarPrimeiraLinha(ws: ExcelJS.Worksheet): number | null {
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const c1 = cvCell(ws.getRow(r).getCell(1)).toUpperCase()
    if (c1.includes('REDES') && c1.includes('FILIAIS')) {
      // próximo r com texto na col 1 é o primeiro registro real
      for (let r2 = r + 1; r2 <= Math.min(r + 5, ws.rowCount); r2++) {
        const c = cvCell(ws.getRow(r2).getCell(1))
        if (c && !c.includes('REDES')) return r2
      }
      return r + 1
    }
  }
  // Fallback: convenção legada (r=5 era o padrão antigo)
  return 5
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

  const start = detectarPrimeiraLinha(ws) ?? 5
  const out: KpiLinha[] = []

  for (let r = start; r <= Math.min(start + 200, ws.rowCount); r++) {
    const row = ws.getRow(r)
    const loja = cvCell(row.getCell(1))
    if (!loja) continue
    // Pula linhas que sejam claramente continuação de cabeçalho ou rodapé
    if (loja.toUpperCase().startsWith('RELATÓRIO') || loja.toUpperCase().startsWith('RELATORIO')) continue
    if (loja.toUpperCase().includes('REDES') && loja.toUpperCase().includes('FILIAIS')) continue

    out.push({
      loja,
      mot1: cvCell(row.getCell(2)),
      placa1: cvCell(row.getCell(4)),
      sc1: fmtKpiCell(row.getCell(5).value),
      chd1: fmtKpiCell(row.getCell(6).value),
      sl1: fmtKpiCell(row.getCell(7).value),
      tempo1: fmtKpiCell(row.getCell(14).value),
      mot2: cvCell(row.getCell(8)),
      placa2: cvCell(row.getCell(10)),
      sc2: fmtKpiCell(row.getCell(11).value),
      chd2: fmtKpiCell(row.getCell(12).value),
      sl2: fmtKpiCell(row.getCell(13).value),
      tempo2: fmtKpiCell(row.getCell(15).value),
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
