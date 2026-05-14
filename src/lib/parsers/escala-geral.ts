import ExcelJS from 'exceljs'
import { normalizaPlaca } from '@/lib/utils/placa'
import { formataDataISO } from '@/lib/utils/data-brasileira'
import type { LinhaEscala } from '@/lib/types/escala'

const ABAS_SKIP = new Set(['2° ENTREGA ', 'ARMAZÉM ', 'MOTORISTAS', 'MATRIZ'])

const RE_DIA_ABA = /^\d{1,2}\s*$/

function cellVal(cell: ExcelJS.Cell | undefined): unknown {
  if (!cell) return null
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && v !== null) {
    if ('text' in v) return (v as { text: string }).text
    if ('result' in v) return (v as { result: unknown }).result
    if ('richText' in v)
      return (v as { richText: { text: string }[] }).richText.map(r => r.text).join('')
  }
  return v
}

function asStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function asNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return isNaN(v) ? null : v
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

function normText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function extractLojaCodigo(nome: string): string | null {
  const m = nome.match(/\bLoja\s+(\d+)/i)
  return m ? m[1] : null
}

function limpaLoja(nome: string): string {
  return nome.replace(/●/g, '').trim()
}

function inferRedeFromLoja(nome: string): string {
  const n = normText(nome)
  if (n.includes('ASSAI') || n.includes('ASSAÍ')) return 'ASSAI'
  if (n.includes('ATACADAO') || n.includes('ATACADÃO')) return 'ATACADAO'
  if (n.includes('CARREFOUR')) return 'CARREFOUR'
  if (n.includes('PREZUNIC')) return 'PREZUNIC'
  if (n.includes('PRINCESA')) return 'PRINCESA'
  if (n.includes('GUANABARA')) return 'GUANABARA'
  if (n.includes("SAM'S") || n.includes('SAMS')) return 'SAMS_CLUB'
  if (n.includes('VIANENSE')) return 'VIANENSE'
  if (n.includes('CAB') && n.includes('PETROPOLIS')) return 'CAB_PETROPOLIS'
  if (n.includes('SENDAS')) return 'SENDAS'
  if (n.includes('FEIRA NOVA')) return 'FEIRA_NOVA'
  if (n.includes('EMANUEL')) return 'EMANUEL'
  if (n.includes('ARMAZEM') && n.includes('GRAO')) return 'ARMAZEM_GRAO'
  if (n.includes('SUPER PAX') || n.includes('SUPERPAX')) return 'SUPER_PAX'
  if (n.includes('SUPER PRIX') || n.includes('SUPERPRIX')) return 'SUPERPRIX'
  return 'DESCONHECIDO'
}

function inferRedeFromSeparator(sep: string): string | null {
  const n = normText(sep)
  if (n.includes('ASSAI') || n.includes('ASSAÍ')) return 'ASSAI'
  if (n.includes('ATACADAO') || n.includes('ATACADÃO')) {
    // Sub-headers like "Atacadão - Manilha" are within ATACADAO, not a new rede separator
    // They have the store format, so we return ATACADAO to update current rede
    return 'ATACADAO'
  }
  if (n.includes('CARREFOUR')) return 'CARREFOUR'
  if (n.includes('SUPER PRIX') || n.includes('SUPERPRIX')) return 'SUPERPRIX'
  if (n.includes('PREZUNIC') || n.includes('LOJAS DO PREZUNIC')) return 'PREZUNIC'
  if (n.includes('PRINCESA')) return 'PRINCESA'
  if (n.includes('GUANABARA')) return 'GUANABARA'
  if (n.includes("SAM'S") || n.includes('SAMS CLUB') || n.includes('SAM S CLUB')) return 'SAMS_CLUB'
  if (n.includes('VIANENSE')) return 'VIANENSE'
  if (n.includes('CAB') && n.includes('PETROPOLIS')) return 'CAB_PETROPOLIS'
  if (n.includes('SENDAS')) return 'SENDAS'
  if (n.includes('FEIRA NOVA')) return 'FEIRA_NOVA'
  if (n.includes('GRUPO EMANUEL') || (n.includes('EMANUEL') && !n.includes('ATACADAO'))) return 'EMANUEL'
  if ((n.includes('ARMAZEM') || n.includes('ARMAZÉM')) && (n.includes('GRAO') || n.includes('GRÃO'))) return 'ARMAZEM_GRAO'
  if (n.includes('SUPER PAX') || n.includes('SUPERPAX')) return 'SUPER_PAX'
  return null
}

function extractDateFromWorksheet(ws: ExcelJS.Worksheet): Date | null {
  const row1 = ws.getRow(1)
  const v = cellVal(row1.getCell(13))
  if (v instanceof Date) {
    // ExcelJS creates UTC midnight dates; normalize to local midnight to avoid off-by-one in UTC-3
    return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())
  }
  if (typeof v === 'string') {
    const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
    const m2 = v.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]))
  }
  return null
}

function parseDayTab(ws: ExcelJS.Worksheet, dataISO: string): LinhaEscala[] {
  const linhas: LinhaEscala[] = []

  let redeAtual = 'DESCONHECIDO'
  let turnoAtual: 'MANHA' | 'TARDE' = 'MANHA'
  let modoBenassi = false
  let modoForaEscala = false

  let ultimaLoja: {
    nome: string
    codigo: string | null
    peso: number | null
    paletes: number | null
    rowNum: number
  } | null = null

  ws.eachRow((row, rowNum) => {
    if (rowNum <= 4) return

    const v1 = cellVal(row.getCell(1))
    const v2 = cellVal(row.getCell(2))
    const v3 = cellVal(row.getCell(3))
    const v4 = cellVal(row.getCell(4))

    const s1 = asStr(v1)

    if (!s1) return

    const n0 = normText(s1)

    // Skip column-header rows (appear inside BENASSI/FORA_ESCALA sub-sections)
    if (n0.includes('REDES') && (n0.includes('FILIAI') || n0.includes('FILIAL'))) return
    // Skip TOTAL summary rows (col4 may carry a formula, so isSeparator won't catch them)
    if (n0.startsWith('TOTAL')) return

    // Merged-cell rows: all columns carry the same text (ExcelJS propagates the master cell value).
    // These are either rede section headers or BENASSI/FORA_ESCALA mode switches.
    const v4str = asStr(v4)
    const isMergedHeader = v4str !== null && v4str === s1

    const isSeparator = isMergedHeader || v4 === null || v4 === undefined || v4str === null

    if (isSeparator) {
      // Secondary delivery row: col4 is genuinely null AND col2 is a numeric weight.
      // (Merged-cell headers are excluded — their col2 carries the same text as col1, not a number.)
      const hasWeight = !isMergedHeader && asNum(v2) !== null
      if (hasWeight && ultimaLoja !== null) {
        // This is an additional delivery row for the previous loja
        const v5 = cellVal(row.getCell(5))
        const v6 = cellVal(row.getCell(6))
        const v7 = cellVal(row.getCell(7))
        const v8 = cellVal(row.getCell(8))
        const v9 = cellVal(row.getCell(9))
        const v10 = cellVal(row.getCell(10))
        const v11 = cellVal(row.getCell(11))
        const v12 = cellVal(row.getCell(12))

        const placaRaw1 = asStr(v8)
        const placaRaw2 = asStr(v12)

        const tipoEmissao = modoBenassi ? 'BENASSI' : modoForaEscala ? 'FORA_ESCALA' : 'NORMAL'
        const redeFromLoja2 = inferRedeFromLoja(ultimaLoja.nome)
        const redeId = modoBenassi ? 'SENDAS'
          : modoForaEscala ? redeFromLoja2
          : redeFromLoja2 !== 'DESCONHECIDO' ? redeFromLoja2 : redeAtual

        const carro1: LinhaEscala = {
          data: dataISO,
          data_entrega: dataISO,
          rede_id: redeId,
          loja_nome_raw: ultimaLoja.nome,
          loja_codigo_raw: ultimaLoja.codigo,
          placa_norm: normalizaPlaca(placaRaw1),
          placa_raw: placaRaw1,
          motorista_nome: asStr(v6),
          motorista_codigo: asStr(v7) !== null ? String(asStr(v7)) : null,
          tipo_carro: asStr(v5),
          carro_ordem: 1,
          turno: turnoAtual,
          tipo_emissao: tipoEmissao,
          obs: modoForaEscala ? 'FORA_ESCALA' : null,
          restricao: null,
          peso_kg: asNum(v2),
          paletes: asNum(v3),
          raw_row_num: rowNum,
        }
        linhas.push(carro1)

        const motor2 = asStr(v10)
        if (motor2 !== null) {
          const carro2: LinhaEscala = {
            ...carro1,
            placa_norm: normalizaPlaca(placaRaw2),
            placa_raw: placaRaw2,
            motorista_nome: motor2,
            motorista_codigo: asStr(v11) !== null ? String(asStr(v11)) : null,
            tipo_carro: asStr(v9),
            carro_ordem: 2,
            restricao: null,
          }
          linhas.push(carro2)
        } else {
          const possibleRestriction = asStr(v9)
          if (possibleRestriction !== null) {
            linhas[linhas.length - 1] = { ...carro1, restricao: possibleRestriction }
          }
        }
        return
      }

      // True separator
      const sepText = s1
      const n = normText(sepText)

      if (n.includes('TOTAL =') || n.startsWith('TOTAL')) return

      if (
        n.includes('CARREGAMENTO DIARIO') &&
        (n.includes('EMISSAO BENASSI') || n.includes('BENASSI'))
      ) {
        modoBenassi = true
        modoForaEscala = false
        redeAtual = 'SENDAS'
        return
      }

      if (
        n.includes('CARREGAMENTO DIARIO') &&
        (n.includes('PEDIDOS FORA ESCALA') || n.includes('FORA ESCALA'))
      ) {
        modoForaEscala = true
        modoBenassi = false
        return
      }

      if (n.includes('SO A TARDE') || n.includes('SO TARDE') || n.includes('SÓ A TARDE') || n.includes('SÓ TARDE')) {
        turnoAtual = 'TARDE'
        return
      }

      const rede = inferRedeFromSeparator(sepText)
      if (rede !== null) {
        redeAtual = rede
      }

      return
    }

    // Data row
    const nomeLoja = limpaLoja(s1)
    const codigo = extractLojaCodigo(nomeLoja)
    const peso = asNum(v2)
    const paletes = asNum(v3)

    ultimaLoja = { nome: nomeLoja, codigo, peso, paletes, rowNum }

    const v5 = cellVal(row.getCell(5))
    const v6 = cellVal(row.getCell(6))
    const v7 = cellVal(row.getCell(7))
    const v8 = cellVal(row.getCell(8))
    const v9 = cellVal(row.getCell(9))
    const v10 = cellVal(row.getCell(10))
    const v11 = cellVal(row.getCell(11))
    const v12 = cellVal(row.getCell(12))

    const placaRaw1 = asStr(v8)
    const placaRaw2 = asStr(v12)

    const tipoEmissao = modoBenassi ? 'BENASSI' : modoForaEscala ? 'FORA_ESCALA' : 'NORMAL'
    const redeFromLoja = inferRedeFromLoja(nomeLoja)
    const redeId = modoBenassi ? 'SENDAS'
      : modoForaEscala ? redeFromLoja
      : redeFromLoja !== 'DESCONHECIDO' ? redeFromLoja : redeAtual

    const restricao1: string | null = (() => {
      const motor2 = asStr(v10)
      if (motor2 === null) {
        return asStr(v9)
      }
      return null
    })()

    const carro1: LinhaEscala = {
      data: dataISO,
      data_entrega: dataISO,
      rede_id: redeId,
      loja_nome_raw: nomeLoja,
      loja_codigo_raw: codigo,
      placa_norm: normalizaPlaca(placaRaw1),
      placa_raw: placaRaw1,
      motorista_nome: asStr(v6),
      motorista_codigo: asStr(v7) !== null ? String(asStr(v7)) : null,
      tipo_carro: asStr(v5),
      carro_ordem: 1,
      turno: turnoAtual,
      tipo_emissao: tipoEmissao,
      obs: modoForaEscala ? 'FORA_ESCALA' : null,
      restricao: restricao1,
      peso_kg: peso,
      paletes,
      raw_row_num: rowNum,
    }
    linhas.push(carro1)

    const motor2 = asStr(v10)
    if (motor2 !== null) {
      const carro2: LinhaEscala = {
        ...carro1,
        placa_norm: normalizaPlaca(placaRaw2),
        placa_raw: placaRaw2,
        motorista_nome: motor2,
        motorista_codigo: asStr(v11) !== null ? String(asStr(v11)) : null,
        tipo_carro: asStr(v9),
        carro_ordem: 2,
        restricao: null,
      }
      linhas.push(carro2)
    }
  })

  return linhas
}

export async function parseEscalaGeral(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string
): Promise<LinhaEscala[]> {
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = (buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer) as any
  await wb.xlsx.load(buf)

  const resultado: LinhaEscala[] = []

  wb.eachSheet(ws => {
    const name = ws.name

    if (ABAS_SKIP.has(name)) return

    const trimmed = name.trim()
    if (!RE_DIA_ABA.test(trimmed)) return

    const dateFromSheet = extractDateFromWorksheet(ws)
    if (!dateFromSheet) {
      console.warn(`[escala-geral] Aba "${trimmed}": data não encontrada, aba ignorada.`)
      return
    }
    const dataISO = formataDataISO(dateFromSheet)

    if (dataAlvo && dataISO !== dataAlvo) return

    const linhas = parseDayTab(ws, dataISO)
    resultado.push(...linhas)
  })

  return resultado
}
