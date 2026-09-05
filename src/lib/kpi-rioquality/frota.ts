import { createServiceClient } from '@/lib/supabase/service'
import { normPlaca } from '@/lib/unitrac-api'

// Frota da Rio Quality (placa -> cv da Unitrac) -- vem da tabela
// kpi_rioquality_frota (migration 20260905000000), nao da API: a API aberta
// da Unitrac lista frota por COD_USER e o da Rio Quality nao foi descoberto
// (ver docs/plans/2026-09-05-kpi-rio-quality.md). Placa fora da tabela =
// sem CV = sem GPS pro dia (sai como "sem rastreador" no KPI, nao inventa).
// Best-effort: erro de banco vira Map vazio + log, nunca lanca.
export async function buscarFrotaRioQuality(): Promise<Map<string, string>> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('kpi_rioquality_frota').select('placa_norm, cv')
  if (error) {
    console.error('[kpi-rioquality/frota] falha ao ler kpi_rioquality_frota:', error.message)
    return new Map()
  }
  const out = new Map<string, string>()
  for (const r of (data ?? []) as { placa_norm: string; cv: string }[]) {
    const p = normPlaca(r.placa_norm)
    if (p && r.cv) out.set(p, String(r.cv))
  }
  return out
}
