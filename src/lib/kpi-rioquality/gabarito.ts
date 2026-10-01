import ExcelJS from 'exceljs'
import type { EntregaRioQualityCompleta } from './parse-planilhas'

// Gabarito da Rio Quality (Tarefa B, 30/09): o arquivo de 55 colunas
// ("Relatório de Entregas (14)") traz o que o app do motorista registrou --
// Check-In + Data Check-In + Status da Entrega. Mede o xlsx do KPI contra
// isso: cobertura (Entregue+check-in que o KPI confirma), erro do horario de
// chegada vs check-in e suspeitas (KPI confirma, status diz Devolvido/
// Faturado). So' leitura -- nao altera o KPI.

export type LinhaKpiXlsx = { placa: string; nf: string; chegada: string; status: string }

const STATUS_SUSPEITOS = new Set(['DEVOLVIDO', 'FATURADO'])

function texto(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (typeof v === 'object' && 'richText' in v) return v.richText.map(t => t.text).join('').trim()
  return String(v).trim()
}

/** Abas de placa do xlsx do KPI (cabecalho com NF/CHEGADA NA LOJA/STATUS). */
export async function lerDetalheKpiXlsx(buf: Buffer): Promise<LinhaKpiXlsx[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const out: LinhaKpiXlsx[] = []
  for (const ws of wb.worksheets) {
    let iNf = -1, iChegada = -1, iStatus = -1, linhaHeader = -1
    ws.eachRow((row, n) => {
      if (linhaHeader >= 0) return
      const cels = (row.values as ExcelJS.CellValue[]).map(texto)
      if (cels.includes('NF') && cels.includes('CHEGADA NA LOJA') && cels.includes('STATUS')) {
        linhaHeader = n
        iNf = cels.indexOf('NF'); iChegada = cels.indexOf('CHEGADA NA LOJA'); iStatus = cels.indexOf('STATUS')
      }
    })
    if (linhaHeader < 0) continue
    ws.eachRow((row, n) => {
      if (n <= linhaHeader) return
      const cels = row.values as ExcelJS.CellValue[]
      const nf = texto(cels[iNf])
      if (!nf) return
      out.push({ placa: ws.name, nf, chegada: texto(cels[iChegada]), status: texto(cels[iStatus]) })
    })
  }
  return out
}

/** "HH:MM" ou "DD/MM/AAAA HH:MM[:SS]" -> minutos do dia (segundos descartados). */
export function minutosDoDia(s: string | null | undefined): number | null {
  const m = /(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(s ?? '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export type ErroChegada = { n: number; medianaMin: number | null; p90Min: number | null; pctAte10Min: number | null }

export type MedidaGabarito = {
  baseEntregueComCheckIn: number
  confirmadasPeloKpi: number
  pctConfirmadas: number | null
  erroChegada: ErroChegada
}

export type SuspeitaGabarito = { nf: string; placa: string; statusGabarito: string; statusKpi: string; motivoDevolucao: string | null }

export type ResultadoGabarito = {
  geral: MedidaGabarito & { nfsGabarito: number; nfsGabaritoForaDoKpi: number }
  suspeitas: SuspeitaGabarito[]
  porPlaca: (MedidaGabarito & { placa: string; suspeitas: number })[]
}

const kpiConfirma = (statusKpi: string) => statusKpi.toUpperCase().startsWith('ENTREGUE')

function mediana(v: number[]): number | null {
  if (v.length === 0) return null
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function p90(v: number[]): number | null {
  if (v.length === 0) return null
  const s = [...v].sort((a, b) => a - b)
  return s[Math.max(0, Math.ceil(0.9 * s.length) - 1)]
}

function medir(pares: { kpi: LinhaKpiXlsx | undefined; g: EntregaRioQualityCompleta }[]): MedidaGabarito {
  const base = pares.filter(p => p.g.gabarito?.status.toUpperCase() === 'ENTREGUE' && p.g.gabarito.checkIn)
  const confirmadas = base.filter(p => p.kpi && kpiConfirma(p.kpi.status))
  const erros: number[] = []
  for (const p of confirmadas) {
    const k = minutosDoDia(p.kpi!.chegada)
    const c = minutosDoDia(p.g.gabarito!.dataCheckIn)
    if (k != null && c != null) erros.push(Math.abs(k - c))
  }
  return {
    baseEntregueComCheckIn: base.length,
    confirmadasPeloKpi: confirmadas.length,
    pctConfirmadas: base.length ? (100 * confirmadas.length) / base.length : null,
    erroChegada: {
      n: erros.length,
      medianaMin: mediana(erros),
      p90Min: p90(erros),
      pctAte10Min: erros.length ? (100 * erros.filter(e => e <= 10).length) / erros.length : null,
    },
  }
}

export function medirGabarito(kpi: LinhaKpiXlsx[], gabarito: EntregaRioQualityCompleta[]): ResultadoGabarito {
  const kpiPorNf = new Map(kpi.map(k => [k.nf, k]))
  const comNf = gabarito.filter(g => g.nf && g.gabarito)
  const pares = comNf.map(g => ({ kpi: kpiPorNf.get(g.nf!), g }))
  const suspeitas: SuspeitaGabarito[] = pares
    .filter(p => p.kpi && kpiConfirma(p.kpi.status) && STATUS_SUSPEITOS.has(p.g.gabarito!.status.toUpperCase()))
    .map(p => ({ nf: p.g.nf!, placa: p.g.placaNorm, statusGabarito: p.g.gabarito!.status, statusKpi: p.kpi!.status, motivoDevolucao: p.g.gabarito!.motivoDevolucao }))
  const porPlacaMap = new Map<string, typeof pares>()
  for (const p of pares) {
    const arr = porPlacaMap.get(p.g.placaNorm) ?? []
    arr.push(p)
    porPlacaMap.set(p.g.placaNorm, arr)
  }
  return {
    geral: { ...medir(pares), nfsGabarito: pares.length, nfsGabaritoForaDoKpi: pares.filter(p => !p.kpi).length },
    suspeitas,
    porPlaca: [...porPlacaMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([placa, ps]) => ({ placa, ...medir(ps), suspeitas: suspeitas.filter(s => s.placa === placa).length })),
  }
}
