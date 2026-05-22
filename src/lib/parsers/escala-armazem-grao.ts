// Parser da Escala do Armazém do Grão (XLSX).
//
// Formato bem simples:
// - 1 aba só (nome = dia do mês, ex '14')
// - Linha 1 = título mesclado A1:E1: "ARMAZÉM DO GRÃO | DD/MM/YYYY"
// - Linha 2+ = dados:
//     A=loja_nome, B=tipo_carro, C=motorista, D=codigo, E=placa
// - Sem peso, sem paletes, sem 2º carro
// - Janela de entrega 12-18h → turno TARDE
// - rede_id fixo: ARMAZEM_GRAO

import ExcelJS from 'exceljs'
import { normalizaPlaca } from '@/lib/utils/placa'
import type { LinhaEscala } from '@/lib/types/escala'

const RE_DIA_ABA = /^\d{1,2}\s*$/

function cellVal(cell: ExcelJS.Cell | undefined): unknown {
  if (!cell) return null
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && v !== null) {
    if (v instanceof Date) return v
    if ('richText' in v) {
      return (v as { richText: { text: string }[] }).richText
        .map((r) => r.text)
        .join('')
    }
    if ('text' in v) return (v as { text: string }).text
    if ('result' in v) return (v as { result: unknown }).result
  }
  return v
}

function asStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function parseTitulo(s: string): { ano: number; mes: number; dia: number } | null {
  // "ARMAZÉM DO GRÃO | 14/05/2026"
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  return { dia: Number(m[1]), mes: Number(m[2]), ano: Number(m[3]) }
}

function isHeaderRow(s: string): boolean {
  const n = s.toUpperCase().trim()
  // Linha do título "ARMAZÉM DO GRÃO 19/05/2026"
  if (n.includes('ARMAZ') && (n.includes('GRAO') || n.includes('GRÃO')) && /\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return true
  // Linha do cabeçalho de colunas "REDES - FILIAS" (variações com acento e traço)
  if (/^REDES\s*[-–—]?\s*FILI/i.test(n)) return true
  // Outras palavras de header que aparecem na col 1
  if (n === 'TOTAL' || n === 'MOTORISTA' || n === 'PLACA' || n === 'COD' || n === 'CARRO') return true
  return false
}

export async function parseEscalaArmazemGrao(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string,
): Promise<LinhaEscala[]> {
  const wb = new ExcelJS.Workbook()
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any)

  const linhas: LinhaEscala[] = []

  // When dataAlvo is specified and no tab has an exact date match, fall back to
  // the latest available tab date that is <= dataAlvo (e.g. Friday's scale used
  // for Saturday/Monday KPI).
  let efectivaDataAlvo: string | undefined = dataAlvo
  if (dataAlvo) {
    const tabDates: string[] = []
    for (const ws of wb.worksheets) {
      if (!RE_DIA_ABA.test(ws.name.trim())) continue
      const row1 = ws.getRow(1)
      const titulo = asStr(cellVal(row1.getCell(1)))
      if (!titulo) continue
      const d = parseTitulo(titulo)
      if (!d) continue
      const iso = `${d.ano}-${String(d.mes).padStart(2, '0')}-${String(d.dia).padStart(2, '0')}`
      tabDates.push(iso)
    }
    const hasExact = tabDates.includes(dataAlvo)
    if (!hasExact && tabDates.length > 0) {
      const candidates = tabDates.filter(d => d <= dataAlvo).sort()
      if (candidates.length > 0) {
        efectivaDataAlvo = candidates[candidates.length - 1]
      }
    }
  }

  for (const ws of wb.worksheets) {
    if (!RE_DIA_ABA.test(ws.name.trim())) continue

    // Linha 1: título com a data
    const row1 = ws.getRow(1)
    const tituloCell = asStr(cellVal(row1.getCell(1)))
    if (!tituloCell) continue
    const datas = parseTitulo(tituloCell)
    if (!datas) {
      console.warn(`[escala-armazem-grao] Aba "${ws.name}": data não encontrada no título "${tituloCell}".`)
      continue
    }
    const ano = datas.ano
    const mes = String(datas.mes).padStart(2, '0')
    const dia = String(datas.dia).padStart(2, '0')
    const dataISO = `${ano}-${mes}-${dia}`

    if (efectivaDataAlvo && dataISO !== efectivaDataAlvo) continue

    // Linhas 2+: dados
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return

      const lojaRaw = asStr(cellVal(row.getCell(1)))
      if (!lojaRaw) return
      if (isHeaderRow(lojaRaw)) return

      const tipoCarro = asStr(cellVal(row.getCell(2)))
      const motorista = asStr(cellVal(row.getCell(3)))
      const codigoVal = cellVal(row.getCell(4))
      const placaRaw = asStr(cellVal(row.getCell(5)))

      // Código pode ser número ou string — guardar como string
      let motoristaCod: string | null = null
      if (codigoVal !== null && codigoVal !== undefined) {
        const s = String(codigoVal).trim()
        motoristaCod = s === '' ? null : s
      }

      // Linha sem placa e sem motorista → descartar (linha em branco/total)
      if (!placaRaw && !motorista) return

      // TOTAL / linhas-resumo
      if (/^TOTAL/i.test(lojaRaw)) return

      // If a proxy date was used (file had no exact match for dataAlvo),
      // report data_entrega as the requested target date so DB queries find it.
      const dataFinal = dataAlvo && efectivaDataAlvo !== dataAlvo ? dataAlvo : dataISO

      const linha: LinhaEscala = {
        data: dataFinal,
        data_entrega: dataFinal,
        rede_id: 'ARMAZEM_GRAO',
        loja_nome_raw: lojaRaw,
        loja_codigo_raw: null,
        placa_norm: normalizaPlaca(placaRaw),
        placa_raw: placaRaw,
        motorista_nome: motorista,
        motorista_codigo: motoristaCod,
        tipo_carro: tipoCarro,
        carro_ordem: 1,
        turno: 'TARDE',
        tipo_emissao: 'NORMAL',
        obs: null,
        restricao: null,
        peso_kg: null,
        paletes: null,
        raw_row_num: rowNum,
      }

      linhas.push(linha)
    })
  }

  return linhas
}
