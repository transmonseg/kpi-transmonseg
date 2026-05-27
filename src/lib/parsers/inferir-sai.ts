import type { SupabaseClient } from '@supabase/supabase-js'
import type { AlteracaoParsed } from './alteracao-text'

const STOP_TOKENS = new Set([
  'LOJA', 'FILIAL', 'CARRO', 'REDE', 'CARREFOUR', 'ASSAI', 'PREZUNIC',
  'PRINCESA', 'SUPERPRIX', 'SENDAS', 'GUANABARA', 'ATACADAO', 'VIANENSE',
  'MUNDIAL', 'EMANUEL', 'MEGA', 'BOX', 'ZONA', 'SUL', 'ARMAZEM',
  'PAX', 'FEIRA', 'NOVA', 'SAMS', 'CLUB', 'CAB', 'PETROPOLIS', 'SUPER',
])

function normTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokensFortes(s: string): string[] {
  return normTexto(s).split(' ').filter(t => t.length >= 4 && !STOP_TOKENS.has(t))
}

export const DIAS_LOOKBACK_INFERIR_SAI = 14

export interface EscalaLinha {
  rede_id: string | null
  loja_nome_raw: string | null
  loja_codigo_raw: string | null
  motorista_nome: string | null
  motorista_codigo: number | string | null
  placa_norm: string | null
  placa_raw: string | null
  carro_ordem: number | null
  data_entrega: string
}

/**
 * Lógica pura: dada uma lista de linhas de escala (ordenadas DESC por data),
 * preenche `sai` em cada alteração quando vazio. Anti-falso-positivo: se
 * `entra` é o mesmo motorista/placa do titular anterior, não preenche
 * (significa segunda viagem do mesmo motorista, não troca).
 */
export function inferirSaiDaEscalaLista(
  parsed: AlteracaoParsed[],
  escala: readonly EscalaLinha[],
): AlteracaoParsed[] {
  if (!escala.length) return parsed

  return parsed.map(p => {
    if (p.sai && (p.sai.placa_norm || p.sai.motorista_nome)) return p
    if (!p.loja_nome_raw) return p

    // Bug D dia 25 (auditoria 2026-05-27): regex precisa exigir "Loja N" ou
    // "Filial N" explicito. Antes pegava o primeiro \b\d{1,3}\b e em
    // "Nova Iguaçu 2 - Loja 291" pegava "2", caia no fallback de tokens e
    // casava qualquer "Nova" do banco com sai errado.
    const filialM = p.loja_nome_raw.match(/\b(?:Loja|Filial)\s+(\d{1,3})\b/i)
    const altTok = tokensFortes(p.loja_nome_raw)

    let linhaMatch: EscalaLinha | null = null

    // 1) Match por filial (prefere o mais recente — escala vem ordenada DESC)
    if (filialM) {
      const filialInt = parseInt(filialM[1], 10)
      for (const l of escala) {
        if (p.rede_id && l.rede_id !== p.rede_id) continue
        const codInt = parseInt(l.loja_codigo_raw ?? '', 10)
        if (!isNaN(codInt) && codInt === filialInt) {
          linhaMatch = l
          break
        }
      }
    }

    // 2) Match por tokens fortes
    if (!linhaMatch && altTok.length >= 1) {
      for (const l of escala) {
        if (p.rede_id && l.rede_id !== p.rede_id) continue
        const linTok = new Set(tokensFortes(l.loja_nome_raw ?? ''))
        if (altTok.every(t => linTok.has(t))) {
          linhaMatch = l
          break
        }
      }
    }

    if (!linhaMatch) return p

    // Anti-falso-positivo: mesmo motorista/placa = segunda viagem, não troca
    const entraNomeNorm = (p.entra?.motorista_nome ?? '').toUpperCase().trim()
    const linhaNomeNorm = (linhaMatch.motorista_nome ?? '').toUpperCase().trim()
    const entraPlaca = p.entra?.placa_norm ?? null
    const linhaPlaca = linhaMatch.placa_norm ?? null
    const mesmoMotorista = entraNomeNorm && linhaNomeNorm && entraNomeNorm === linhaNomeNorm
    const mesmaPlaca = entraPlaca && linhaPlaca && entraPlaca === linhaPlaca
    if (mesmoMotorista || mesmaPlaca) return p

    return {
      ...p,
      sai: {
        motorista_nome: linhaMatch.motorista_nome ?? null,
        motorista_codigo: linhaMatch.motorista_codigo
          ? parseInt(String(linhaMatch.motorista_codigo), 10)
          : null,
        placa_raw: linhaMatch.placa_raw ?? null,
        placa_norm: linhaMatch.placa_norm ?? null,
      },
    }
  })
}

/**
 * Wrapper que busca no Supabase nos últimos DIAS_LOOKBACK_INFERIR_SAI dias
 * (incluindo o dia atual) ordenado DESC. Usa o resultado pra inferir o
 * titular anterior de cada loja mencionada nas alterações.
 *
 * Bug original: query era `eq('data_entrega', data)` — se a escala do dia
 * atual ainda não tinha sido uploadada, retornava vazio e sai ficava null
 * em 100% dos casos. Fallback nos 14 dias anteriores resolve.
 */
export async function inferirSaiDaEscala(
  parsed: AlteracaoParsed[],
  data: string,
  supabase: SupabaseClient,
): Promise<AlteracaoParsed[]> {
  if (!data) return parsed

  const desde = new Date(new Date(data + 'T00:00:00Z').getTime() - DIAS_LOOKBACK_INFERIR_SAI * 86400_000)
    .toISOString()
    .slice(0, 10)

  const { data: escala } = await supabase
    .from('escala_linhas')
    .select('rede_id, loja_nome_raw, loja_codigo_raw, motorista_nome, motorista_codigo, placa_norm, placa_raw, carro_ordem, data_entrega')
    .gte('data_entrega', desde)
    .lte('data_entrega', data)
    .order('data_entrega', { ascending: false })

  if (!escala?.length) return parsed
  return inferirSaiDaEscalaLista(parsed, escala as EscalaLinha[])
}
