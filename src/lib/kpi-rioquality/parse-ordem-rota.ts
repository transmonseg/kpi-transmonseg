// 12/11 (Érica/Ana, KPI AJUSTES): "Relatório de Entregas das cargas" da Fusion
// da Rio Quality -- o único que vem com a ORDEM da roteirização. Layout:
// blocos por carga ("CARGA | CARGA(S) ERP | MOTORISTA | VEICULO ...", a linha
// da carga, "ENTREGAS DETALHADAS:", cabeçalho "ID ROMANEIO | ORDEM | ... | NF")
// seguidos das entregas. Não substitui o romaneio do dia: só traz a ordem.
import * as XLSX from 'xlsx'
import { normPlaca } from '@/lib/unitrac-api'

export type OrdemRotaLinha = {
  nf: string
  romaneio: string
  placa: string
  ordem: number
  previsaoInicio: string | null // "DD/MM/AAAA HH:MM:SS" como veio
  previsaoFim: string | null
}

const semAcento = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
const celula = (v: unknown) => { const s = String(v ?? '').trim(); return s === '' || s === '--' ? null : s }

function linhas(buf: Buffer): unknown[][] {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as unknown[][]) : []
}

const ehCabecalhoEntregas = (r: unknown[] | undefined) => semAcento(r?.[0]) === 'ID ROMANEIO' && semAcento(r?.[1]) === 'ORDEM'

/** É o relatório com ordem? (cabeçalho "ID ROMANEIO | ORDEM" em algum lugar) */
export function ehRelatorioOrdemRota(buf: Buffer): boolean {
  try { return linhas(buf).some(ehCabecalhoEntregas) } catch { return false }
}

export function parseOrdemRota(buf: Buffer): OrdemRotaLinha[] {
  const rows = linhas(buf)
  const out: OrdemRotaLinha[] = []
  let placa = ''
  let col: { nf: number; ini: number; fim: number } | null = null
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? []
    if (semAcento(r[0]) === 'CARGA' && semAcento(r[3]) === 'VEICULO') {
      // "CURUPIRA - RIQ4G11": a placa é o último pedaço.
      const veiculo = String(rows[i + 1]?.[3] ?? '')
      placa = normPlaca(veiculo.split(' - ').pop() ?? '')
      continue
    }
    if (ehCabecalhoEntregas(r)) {
      const h = r.map(semAcento)
      col = { nf: h.indexOf('NF'), ini: h.indexOf('PREVISAO DE INICIO'), fim: h.findIndex(x => x.startsWith('PREVISAO DE TERM')) }
      continue
    }
    if (!col || col.nf < 0) continue
    const romaneio = celula(r[0]); const ordem = Number(r[1]); const nf = celula(r[col.nf])
    if (!romaneio || !/^\d+$/.test(romaneio) || !Number.isInteger(ordem) || ordem <= 0 || !nf) continue
    out.push({
      nf: nf.replace(/\D/g, ''), romaneio, placa, ordem,
      previsaoInicio: col.ini >= 0 ? celula(r[col.ini]) : null,
      previsaoFim: col.fim >= 0 ? celula(r[col.fim]) : null,
    })
  }
  return out
}
