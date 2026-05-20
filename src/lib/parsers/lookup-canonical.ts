import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParseContext, Associacao } from './alteracoes-v2.types'
import { normalizaNomeMotorista } from './alteracoes-v2'

const DIAS_LOOKBACK = 60

export async function buildLookupContext(svc: SupabaseClient): Promise<ParseContext> {
  const desde = new Date(Date.now() - DIAS_LOOKBACK * 86400 * 1000)
    .toISOString()
    .slice(0, 10)

  const { data: escalasRaw } = await svc
    .from('escala_linhas')
    .select('motorista_nome, motorista_codigo, placa_norm, placa_raw, data_entrega, rede_id')
    .gte('data_entrega', desde)

  const associacoes: Associacao[] = (escalasRaw ?? []).map((r) => {
    const row = r as Record<string, unknown>
    return {
      motorista_nome: (row.motorista_nome as string) ?? '',
      motorista_nome_norm: normalizaNomeMotorista((row.motorista_nome as string) ?? ''),
      motorista_codigo: (row.motorista_codigo as number | null) ?? null,
      placa_norm: (row.placa_norm as string | null) ?? null,
      placa_raw: (row.placa_raw as string | null) ?? null,
      data_entrega: (row.data_entrega as string) ?? '',
      rede_id: (row.rede_id as string | null) ?? null,
    }
  })

  const { data: lojasRaw } = await svc
    .from('lojas')
    .select('rede_id, nome, codigo_escala')
    .eq('ativo', true)

  const lojas = (lojasRaw ?? []).map((r) => {
    const row = r as Record<string, unknown>
    const nome = (row.nome as string) ?? ''
    return {
      rede_id: (row.rede_id as string) ?? '',
      nome,
      nome_norm: normalizaNomeMotorista(nome),
      codigo_escala: (row.codigo_escala as string | null) ?? null,
    }
  })

  return { associacoes, lojas }
}
