import { apiGet } from '@/lib/unitrac-api/client'
import type { StopApiCru } from '@/lib/unitrac-api/consolida'

// Task 1 (plano 2026-09-30, estudo item 4b): `buscarStopsCru` (compartilhado
// com a Nutry Max) devolve [] tanto quando a Unitrac respondeu "sem parada"
// quanto quando a consulta FALHOU (apiGet -> null em erro/timeout/status !=
// 200). Na Rio Quality isso virava "SEM RASTREADOR"/pendente falso em lote,
// sem aviso (falha silenciosa). Variante propria: erro LANCA, vazio e' [].
// Mesmo endpoint e mesmo filtro de coordenada de buscarStopsCru.
export async function buscarStopsCruOuErro(cv: string, horas: number): Promise<StopApiCru[]> {
  const d = (await apiGet(`/mapa_servicos/stops/${cv}/${horas}`)) as { paradas?: StopApiCru[] } | null
  if (d == null) throw new Error(`consulta /stops da Unitrac falhou (cv ${cv})`)
  return (d.paradas ?? []).filter(p => p.latitude != null && p.longitude != null && Math.abs(p.latitude) > 1)
}
