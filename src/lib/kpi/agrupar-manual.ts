import { REDE_LABEL } from '@/lib/kpi/redes'
import type { LinhaManual, RedeManual } from '@/lib/kpi/manual-tipos'

/** Agrupa linhas soltas de kpi_manual_entradas por rede, na ordem em que a
 *  primeira linha de cada rede aparece (a query já vem ordenada por id). */
export function agruparPorRede(linhas: LinhaManual[]): RedeManual[] {
  const porRede = new Map<string, LinhaManual[]>()
  for (const l of linhas) {
    const arr = porRede.get(l.rede_id) ?? []
    arr.push(l)
    porRede.set(l.rede_id, arr)
  }
  return [...porRede.entries()].map(([rede_id, linhasRede]) => ({
    rede_id,
    rede_nome: REDE_LABEL[rede_id] ?? rede_id,
    linhas: linhasRede,
  }))
}
