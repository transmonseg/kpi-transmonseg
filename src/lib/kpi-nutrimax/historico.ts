import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'nutrimax-outputs'

export type TipoGeracaoNutrimax = 'KPI' | 'ROMANEIO'

export type SalvarGeracaoParams = {
  tipo: TipoGeracaoNutrimax
  data: string
  filename: string
  resumo: Record<string, unknown>
  geradoPor: string
  /** Objeto completo salvo no cache.json — o mesmo JSON que a rota devolve
   *  pro browser (resumo + linhas + xlsxBase64 + filename). */
  payload: unknown
}

/** Persiste uma geração (Gerar KPI ou Gerar Romaneio) — best-effort: nunca
 *  lança. Devolve o id da geração, ou null se o INSERT falhar. Se só o
 *  upload do cache falhar, ainda devolve o id (a linha existe no histórico,
 *  só o "reabrir" dessa geração específica não vai funcionar). */
export async function salvarGeracao(
  svc: SupabaseClient,
  params: SalvarGeracaoParams,
): Promise<string | null> {
  const { data: inserted, error } = await svc
    .from('kpi_nutrimax_geracoes')
    .insert({
      tipo: params.tipo,
      data: params.data,
      filename: params.filename,
      resumo: params.resumo,
      gerado_por: params.geradoPor,
    })
    .select('id')
    .single()
  if (error || !inserted) return null
  const id = (inserted as { id: string }).id

  try {
    await svc.storage.createBucket(BUCKET, { public: false }).catch(() => {})
    await svc.storage
      .from(BUCKET)
      .upload(`${id}/cache.json`, Buffer.from(JSON.stringify(params.payload), 'utf-8'), {
        contentType: 'application/json',
        upsert: true,
      })
  } catch (e) {
    console.warn('[kpi-nutrimax/historico] cache upload falhou (best-effort):', e instanceof Error ? e.message : e)
  }
  return id
}

export type GeracaoCarregada = { tipo: TipoGeracaoNutrimax; payload: unknown }

/** Busca uma geração salva pelo id — devolve o tipo (pra tela saber como
 *  interpretar o payload) + o cache.json completo. null se a geração não
 *  existe ou o cache sumiu. */
export async function buscarGeracao(
  svc: SupabaseClient,
  id: string,
): Promise<GeracaoCarregada | null> {
  const { data: row, error } = await svc
    .from('kpi_nutrimax_geracoes')
    .select('tipo')
    .eq('id', id)
    .maybeSingle()
  if (error || !row) return null

  const { data: blob, error: dlErr } = await svc.storage.from(BUCKET).download(`${id}/cache.json`)
  if (dlErr || !blob) return null

  try {
    const payload = JSON.parse(await blob.text())
    return { tipo: (row as { tipo: TipoGeracaoNutrimax }).tipo, payload }
  } catch {
    return null
  }
}
