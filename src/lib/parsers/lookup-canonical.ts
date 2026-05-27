import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParseContext, Associacao, SlotVeiculo } from './alteracoes-v2.types'
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

export interface LookupInput {
  placas: string[]
  codigos: number[]
  nomeHint: string
}

export interface LookupOptions {
  /**
   * Bug U3 da auditoria externa 2026-05-27: quando mensagem WhatsApp menciona
   * NOME + PLACA e a placa estava recentemente associada a OUTRO motorista no
   * banco, lookupSlot retornava o motorista do banco ignorando o nome da
   * mensagem. Com preferNome=true, nomeHint vence sobre match por placa.
   */
  preferNome?: boolean
}

export function lookupSlot(
  input: LookupInput,
  ctx: ParseContext,
  options: LookupOptions = {},
): SlotVeiculo {
  const { placas, codigos, nomeHint } = input
  const { preferNome = false } = options

  let match: Associacao | null = null

  if (preferNome && nomeHint) {
    const sorted = ctx.associacoes
      .filter((a) => nomesParecidos(a.motorista_nome_norm, nomeHint))
      .sort((a, b) => b.data_entrega.localeCompare(a.data_entrega))
    if (sorted.length > 0) match = sorted[0]
  }

  if (!match && placas.length > 0) {
    const sorted = ctx.associacoes
      .filter((a) => placas.includes(a.placa_norm ?? ''))
      .sort((a, b) => b.data_entrega.localeCompare(a.data_entrega))
    if (sorted.length > 0) match = sorted[0]
  }

  if (!match && codigos.length > 0) {
    const sorted = ctx.associacoes
      .filter((a) => a.motorista_codigo !== null && codigos.includes(a.motorista_codigo))
      .sort((a, b) => b.data_entrega.localeCompare(a.data_entrega))
    if (sorted.length > 0) match = sorted[0]
  }

  if (!match && nomeHint) {
    const sorted = ctx.associacoes
      .filter((a) => nomesParecidos(a.motorista_nome_norm, nomeHint))
      .sort((a, b) => b.data_entrega.localeCompare(a.data_entrega))
    if (sorted.length > 0) match = sorted[0]
  }

  const placaMsg = placas[0] ?? null
  const codigoMsg = codigos[0] ?? null

  return {
    motorista_nome: match?.motorista_nome ?? null,
    fonte_nome: match?.motorista_nome ? 'banco' : null,
    motorista_codigo: codigoMsg ?? match?.motorista_codigo ?? null,
    fonte_codigo: codigoMsg ? 'mensagem' : match?.motorista_codigo != null ? 'banco' : null,
    placa_norm: placaMsg ?? match?.placa_norm ?? null,
    placa_raw: placaMsg ? formataPlacaDisplay(placaMsg) : match?.placa_raw ?? null,
    fonte_placa: placaMsg ? 'mensagem' : match?.placa_norm ? 'banco' : null,
  }
}

function nomesParecidos(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  return levenshtein(a, b) <= 2
}

function levenshtein(a: string, b: string): number {
  const la = a.length, lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la
  const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[la][lb]
}

function formataPlacaDisplay(norm: string): string {
  if (norm.length !== 7) return norm
  return `${norm.slice(0, 3)}-${norm.slice(3)}`
}
