import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Task 4 (plano 2026-09-30, estudo item 10): snapshot noturno de paradas da
// Rio Quality em kpi_paradas_snapshot (mesma tabela/merge da Nutry Max, ver
// kpi-romaneio/paradas-snapshot.ts) -- sem ele nenhum dia da RQ e' regeravel
// depois que o /stops da Unitrac (48h) vence. Chamado pelo cron existente
// scripts/snapshot-paradas-noturno.ts, por CV da kpi_rioquality_frota.
export const EMPRESA_SNAPSHOT_RIOQUALITY = 'rioquality'

/** Paradas por dia e placa. Placa cuja consulta falhou fica FORA do mapa do
 *  dia (nunca grava [] por erro -- o snapshot so' cresce, mas um [] gravado
 *  por falha faria a placa parecer "consultada e vazia"). */
export async function capturarParadasRioQuality(
  frota: Map<string, string>,
  dias: string[],
  buscar: (cv: string, placaNorm: string, dia: string) => Promise<UnitracParadaRow[]>,
): Promise<{ porDia: Map<string, Map<string, UnitracParadaRow[]>>; falhas: string[] }> {
  const porDia = new Map(dias.map(d => [d, new Map<string, UnitracParadaRow[]>()]))
  const falhas: string[] = []
  for (const [placaNorm, cv] of frota) {
    for (const dia of dias) {
      try {
        porDia.get(dia)!.set(placaNorm, await buscar(cv, placaNorm, dia))
      } catch (err) {
        falhas.push(`${placaNorm}/${dia}`)
        console.error(`  falha ao buscar paradas RQ ${placaNorm}/${dia}:`, err instanceof Error ? err.message : err)
      }
    }
  }
  return { porDia, falhas }
}
