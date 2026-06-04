import type { SupabaseClient } from '@supabase/supabase-js'

export interface TrgmResult {
  canonical_id: string
  canonical_nm: string
  trgm_score: number
  match_source: 'canonical' | 'alias'
}

export async function batchTrgmLookup(
  supabase: SupabaseClient,
  rawNames: string[],
  threshold = 0.25
): Promise<Record<string, TrgmResult>> {
  if (rawNames.length === 0) return {}

  const { data, error } = await supabase.rpc('batch_trgm_lookup', {
    p_names: rawNames,
    p_threshold: threshold,
  })

  if (error || !data) {
    console.error('[trgm-lookup] RPC error:', error)
    return {}
  }

  type TrgmRow = {
    input_name: string
    canonical_id: string
    canonical_nm: string
    trgm_score: number
    match_source: 'canonical' | 'alias'
  }
  const result: Record<string, TrgmResult> = {}
  for (const row of data as TrgmRow[]) {
    result[row.input_name] = {
      canonical_id: row.canonical_id,
      canonical_nm: row.canonical_nm,
      trgm_score: row.trgm_score,
      match_source: row.match_source,
    }
  }
  return result
}
