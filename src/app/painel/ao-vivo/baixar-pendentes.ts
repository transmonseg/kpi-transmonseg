import type { PlacaAoVivo } from '@/lib/kpi-romaneio/ao-vivo'
import { COLUNAS_PENDENTES, linhasPendentesPorAba, type LinhaPendente } from '@/lib/kpi-romaneio/relatorio-pendentes'

// F1-10 (ACH-06): três abas pelo que pesa na taxa. A Érica tirava à mão a
// carga sem placa e o sem rastreador (22/10: 90 linhas contra 70 na conta).
const ABAS: { chave: 'afetam' | 'fora' | 'semRastreador'; nome: string }[] = [
  { chave: 'afetam', nome: 'Afetam a taxa' },
  { chave: 'fora', nome: 'Fora da conta' },
  { chave: 'semRastreador', nome: 'Sem rastreador (corretas)' },
]

/** Monta e baixa o xlsx das NFs não entregues. exceljs só carrega no clique.
 *  Devolve quantas linhas foram pro arquivo (0 = nada baixado). */
export async function baixarPendentes(placas: PlacaAoVivo[], nomeCliente: string, data: string, cliente: string): Promise<number> {
  const abas = linhasPendentesPorAba(placas, { origem: window.location.origin, data, cliente })
  const total = abas.afetam.length + abas.fora.length + abas.semRastreador.length
  if (total === 0) return 0

  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  for (const { chave, nome } of ABAS) {
    const linhas: LinhaPendente[] = abas[chave]
    const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = COLUNAS_PENDENTES.map(c => ({ header: c.titulo, key: c.chave, width: c.largura }))
    ws.addRows(linhas.map(l => ({ ...l, mapa: l.mapa ? { text: 'Abrir', hyperlink: l.mapa } : '' })))
    const cab = ws.getRow(1)
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS_PENDENTES.length } }
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Pendentes-${nomeCliente.replace(/\s+/g, '-')}-${data}.xlsx`
  a.click()
  URL.revokeObjectURL(a.href)
  return total
}
