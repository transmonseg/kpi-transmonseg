import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Task 4 (plano 2026-09-30, estudo item 10): snapshot noturno de paradas da
// Rio Quality em kpi_paradas_snapshot (mesma tabela/merge da Nutry Max, ver
// kpi-romaneio/paradas-snapshot.ts) -- sem ele nenhum dia da RQ e' regeravel
// depois que o /stops da Unitrac (48h) vence. Chamado pelo cron existente
// scripts/snapshot-paradas-noturno.ts, por CV da kpi_rioquality_frota.
export const EMPRESA_SNAPSHOT_RIOQUALITY = 'rioquality'

/** Espera padrao entre a 1a tentativa e o retry de uma consulta /stops. */
export const ESPERA_RETRY_SNAPSHOT_MS = 2000

const dormir = (ms: number) => new Promise<void>(res => setTimeout(res, ms))

/** Revisao independente 30/09: 1 retry (com pequena espera) por consulta --
 *  um soluco da Unitrac perdia a placa no snapshot do dia, e depois das 48h
 *  o dia nao e' mais regeravel. Lanca o erro da 2a tentativa. Usado tambem
 *  pela Nutry Max em scripts/snapshot-paradas-noturno.ts (so' o retry). */
export async function comUmRetry<T>(
  fn: () => Promise<T>,
  esperaMs: number = ESPERA_RETRY_SNAPSHOT_MS,
  esperar: (ms: number) => Promise<void> = dormir,
): Promise<T> {
  try {
    return await fn()
  } catch {
    await esperar(esperaMs)
    return await fn()
  }
}

/** Fracao maxima de consultas RQ (placa x dia) que pode falhar (apos retry)
 *  sem o cron sair com codigo 1. Falha isolada fica no log e a placa so'
 *  nao entra no snapshot do dia (as outras sao gravadas normalmente); acima
 *  disso e' a Unitrac/rede fora do ar e o cron precisa acusar. 20% = ~20 de
 *  ~100 consultas numa noite (frota ~50 placas x hoje+ontem). */
export const LIMITE_FRACAO_FALHAS_SNAPSHOT_RQ = 0.2

export function falhasSnapshotRqExcedemLimite(falhas: number, totalConsultas: number): boolean {
  return totalConsultas > 0 && falhas / totalConsultas > LIMITE_FRACAO_FALHAS_SNAPSHOT_RQ
}

/** Paradas por dia e placa. Placa cuja consulta falhou (mesmo apos 1 retry)
 *  fica FORA do mapa do dia (nunca grava [] por erro -- o snapshot so'
 *  cresce, mas um [] gravado por falha faria a placa parecer "consultada e
 *  vazia"); as outras placas seguem normais. */
export async function capturarParadasRioQuality(
  frota: Map<string, string>,
  dias: string[],
  buscar: (cv: string, placaNorm: string, dia: string) => Promise<UnitracParadaRow[]>,
  opcoes: { esperaMs?: number; esperar?: (ms: number) => Promise<void> } = {},
): Promise<{ porDia: Map<string, Map<string, UnitracParadaRow[]>>; falhas: string[]; totalConsultas: number }> {
  const porDia = new Map(dias.map(d => [d, new Map<string, UnitracParadaRow[]>()]))
  const falhas: string[] = []
  let totalConsultas = 0
  for (const [placaNorm, cv] of frota) {
    for (const dia of dias) {
      totalConsultas++
      try {
        porDia.get(dia)!.set(placaNorm, await comUmRetry(() => buscar(cv, placaNorm, dia), opcoes.esperaMs, opcoes.esperar))
      } catch (err) {
        falhas.push(`${placaNorm}/${dia}`)
        console.error(`  falha ao buscar paradas RQ ${placaNorm}/${dia} (apos retry):`, err instanceof Error ? err.message : err)
      }
    }
  }
  return { porDia, falhas, totalConsultas }
}
