// Cache do dia (06/10, "a geração demora" -- maior reclamação): consultas
// externas caras reaproveitadas entre gerações do mesmo dia. Lido de uma vez
// por prefixo/dia, gravado de uma vez no fim; qualquer falha vira consulta
// normal (fail-open). Apagado depois de 7 dias (limparCacheDia, tick do ao vivo).
import { createServiceClient } from '@/lib/supabase/service'

const DIAS_GUARDADOS = 7

/** Hoje o dado ainda muda (paradas novas): 4 min. Dia passado: 6 h. */
export function validadeCacheMs(data: string, hoje: string): number {
  return data === hoje ? 4 * 60_000 : 6 * 3600_000
}

export function cacheFresco(gravadoEm: string | null, data: string, hoje: string, agoraMs: number): boolean {
  if (!gravadoEm) return false
  return agoraMs - Date.parse(gravadoEm) < validadeCacheMs(data, hoje)
}

/** Entradas frescas do prefixo no dia (chave sem o prefixo -> valor). */
export async function lerCacheDia<T>(prefixo: string, data: string, hoje: string, validadeMs?: number): Promise<Map<string, T>> {
  try {
    const { data: linhas, error } = await createServiceClient().from('kpi_cache_dia')
      .select('chave, valor, gravado_em').eq('data', data).like('chave', `${prefixo}:%`)
    if (error) throw new Error(error.message)
    const agora = Date.now()
    return new Map((linhas ?? [])
      .filter(l => validadeMs != null ? agora - Date.parse(l.gravado_em as string) < validadeMs : cacheFresco(l.gravado_em as string, data, hoje, agora))
      .map(l => [(l.chave as string).slice(prefixo.length + 1), l.valor as T]))
  } catch (err) {
    console.error(`[cache-dia] leitura ${prefixo} falhou:`, err instanceof Error ? err.message : err)
    return new Map()
  }
}

export async function gravarCacheDia(prefixo: string, data: string, valores: Map<string, unknown>): Promise<void> {
  if (valores.size === 0) return
  try {
    const gravadoEm = new Date().toISOString()
    const linhas = [...valores].map(([k, valor]) => ({ chave: `${prefixo}:${k}`, data, valor, gravado_em: gravadoEm }))
    for (let i = 0; i < linhas.length; i += 200) {
      const { error } = await createServiceClient().from('kpi_cache_dia').upsert(linhas.slice(i, i + 200), { onConflict: 'chave' })
      if (error) throw new Error(error.message)
    }
  } catch (err) {
    console.error(`[cache-dia] gravação ${prefixo} falhou:`, err instanceof Error ? err.message : err)
  }
}

/** Apaga o que tem mais de 7 dias (data do dado ou gravação). */
export async function limparCacheDia(hoje: string): Promise<void> {
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - DIAS_GUARDADOS)
  const limite = d.toISOString().slice(0, 10)
  const svc = createServiceClient()
  await svc.from('kpi_cache_dia').delete().lt('data', limite)
  await svc.from('kpi_cache_dia').delete().lt('gravado_em', `${limite}T00:00:00Z`)
}
