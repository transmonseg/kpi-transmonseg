import { createServiceClient } from '@/lib/supabase/service'
import { normPlaca } from '@/lib/unitrac-api'

// Frota da Rio Quality (placa -> cv da Unitrac) -- vem da tabela
// kpi_rioquality_frota (migration 20260905000000), nao da API: a API aberta
// da Unitrac lista frota por COD_USER e o da Rio Quality nao foi descoberto
// (ver docs/plans/2026-09-05-kpi-rio-quality.md). Placa fora da tabela =
// sem CV = sem GPS pro dia (sai como "sem rastreador" no KPI, nao inventa).
// F1-12 (KRQ-09, plano mestre 23/10): erro de banco ou tabela vazia LANCA.
// Antes virava Map vazio + log: toda placa ficava "sem rastreador", que conta
// como correta, e a taxa do dia ia a ~100% sem nenhum aviso.
export class FrotaRioQualityIndisponivelError extends Error {
  constructor(motivo: string) {
    super(`Não consegui ler a frota da Rio Quality (${motivo}). O KPI não foi calculado para não contar todas as NFs como "sem rastreador"; tente de novo em alguns minutos.`)
    this.name = 'FrotaRioQualityIndisponivelError'
  }
}

export async function buscarFrotaRioQuality(): Promise<Map<string, string>> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('kpi_rioquality_frota').select('placa_norm, cv')
  if (error) {
    console.error('[kpi-rioquality/frota] falha ao ler kpi_rioquality_frota:', error.message)
    throw new FrotaRioQualityIndisponivelError(error.message)
  }
  const out = new Map<string, string>()
  for (const r of (data ?? []) as { placa_norm: string; cv: string }[]) {
    const p = normPlaca(r.placa_norm)
    if (p && r.cv) out.set(p, String(r.cv))
  }
  if (out.size === 0) throw new FrotaRioQualityIndisponivelError('tabela kpi_rioquality_frota sem nenhuma placa')
  return out
}
