import type { PlacaAoVivo } from '@/lib/kpi-romaneio/ao-vivo'
import { COLUNAS_PENDENTES, linhasPendentes } from '@/lib/kpi-romaneio/relatorio-pendentes'

/** Monta e baixa o xlsx das NFs não entregues. exceljs só carrega no clique.
 *  Devolve quantas linhas foram pro arquivo (0 = nada baixado). */
export async function baixarPendentes(placas: PlacaAoVivo[], nomeCliente: string, data: string): Promise<number> {
  const linhas = linhasPendentes(placas)
  if (linhas.length === 0) return 0

  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Pendentes', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = COLUNAS_PENDENTES.map(c => ({ header: c.titulo, key: c.chave, width: c.largura }))
  ws.addRows(linhas)
  const cab = ws.getRow(1)
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS_PENDENTES.length } }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Pendentes-${nomeCliente.replace(/\s+/g, '-')}-${data}.xlsx`
  a.click()
  URL.revokeObjectURL(a.href)
  return linhas.length
}
