import type { createServiceClient } from '@/lib/supabase/service'
import type { EntradaManual } from './parse-kpi-manual'

type Svc = ReturnType<typeof createServiceClient>

/**
 * Intervalo [ini, fim] (YYYY-MM-DD) do período selecionado.
 * Semana operacional começa na SEGUNDA (convenção BR), não no domingo.
 * `ref` já é uma data BRT pura (YYYY-MM-DD), por isso a aritmética em UTC é segura.
 */
export function intervaloPeriodo(periodo: string, ref: string): [string, string] {
  const d = new Date(`${ref}T00:00:00Z`)
  if (periodo === 'dia') return [ref, ref]
  if (periodo === 'semana') {
    const day = d.getUTCDay()        // 0=dom .. 6=sáb
    const offset = (day + 6) % 7     // dias decorridos desde a última segunda
    const i = new Date(d); i.setUTCDate(d.getUTCDate() - offset)
    const f = new Date(i); f.setUTCDate(i.getUTCDate() + 6)
    return [i.toISOString().slice(0, 10), f.toISOString().slice(0, 10)]
  }
  // mês
  const i = `${ref.slice(0, 7)}-01`
  const f = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return [i, f.toISOString().slice(0, 10)]
}

/**
 * Carrega TODAS as entradas de kpi_manual_entradas no intervalo, paginando até
 * esgotar. O Supabase limita SELECT a 1000 linhas por default; com 473 lojas × 18
 * redes, um período 'mes' (ou 'semana' cheia) passa fácil de 1000 — sem paginar,
 * calcularMetricas processava só as primeiras 1000 e devolvia taxa/total/série
 * SILENCIOSAMENTE errados. ORDER BY id (PK uuid) garante janelas estáveis, sem
 * repetir nem pular linhas entre as páginas.
 */
export async function carregarEntradasManuais(svc: Svc, ini: string, fim: string): Promise<EntradaManual[]> {
  const PAGE = 1000
  const linhas: EntradaManual[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await svc.from('kpi_manual_entradas')
      .select('data, rede_id, loja, placa, motorista, status, saida_cd, chd, sai')
      .gte('data', ini).lte('data', fim)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const lote = (data ?? []) as EntradaManual[]
    linhas.push(...lote)
    if (lote.length < PAGE) break
  }
  return linhas
}
