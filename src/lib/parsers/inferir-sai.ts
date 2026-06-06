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

/** Extrai o nº do carro (1 ou 2) de textos tipo "2º CARRO" / "Filial 08 - 2° carro". */
function extraiCarro(s: string | null | undefined): number | null {
  if (!s) return null
  const m = s.match(/(\d)\s*[ºo°]?\s*carro/i) ?? s.match(/carro\s*(\d)/i)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n === 1 || n === 2) return n
  }
  return null
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
    // Carro da alteração (1º/2º) — vem no motivo ("2º CARRO") ou no nome da loja
    // ("Filial 08 - 2° carro"). Usado pra casar a linha do MESMO carro.
    const carroAlt = extraiCarro(p.motivo) ?? extraiCarro(p.loja_nome_raw)

    // Coleta TODAS as linhas da loja (escala vem DESC por data → mais recente primeiro).
    const candidatos: EscalaLinha[] = []

    // 1) Match por filial
    if (filialM) {
      const filialInt = parseInt(filialM[1], 10)
      for (const l of escala) {
        if (p.rede_id && l.rede_id !== p.rede_id) continue
        const codInt = parseInt(l.loja_codigo_raw ?? '', 10)
        if (!isNaN(codInt) && codInt === filialInt) candidatos.push(l)
      }
    }

    // 2) Match por tokens fortes (se a filial não achou nada)
    if (candidatos.length === 0 && altTok.length >= 1) {
      for (const l of escala) {
        if (p.rede_id && l.rede_id !== p.rede_id) continue
        const linTok = new Set(tokensFortes(l.loja_nome_raw ?? ''))
        if (altTok.every(t => linTok.has(t))) candidatos.push(l)
      }
    }

    if (candidatos.length === 0) return p

    // Quando a alteração diz o carro (1º/2º), casa a linha DAQUELE carro — senão o
    // 2º carro pegava o SAI do 1º (caso real Assaí Camil 211). Sem info de carro,
    // usa a 1ª (mais recente).
    let linhaMatch: EscalaLinha = candidatos[0]
    if (carroAlt != null) {
      const doCarro = candidatos.find(l => l.carro_ordem === carroAlt)
      if (doCarro) linhaMatch = doCarro
    }

    // Anti-falso-positivo: SO ignora se motorista E placa iguais (alteracao
    // redundante). Casos validos que ANTES eram bloqueados:
    //   - mesmo motorista, placa diferente → "troca de carro" (sai = motorista+placa antiga)
    //   - motorista diferente, mesma placa → "troca de motorista, mesmo carro" (sai = motorista anterior)
    // Bug descoberto dia 19: ASSAI Loja 133 (FELIPE DIEGO/UGA-1D55 → FELIPE DIEGO/UBO-5E01).
    // Antes: mesmoMotorista=true → bloqueava. Agora: precisa mesmoMotorista E mesmaPlaca pra bloquear.
    const entraNomeNorm = (p.entra?.motorista_nome ?? '').toUpperCase().trim()
    const linhaNomeNorm = (linhaMatch.motorista_nome ?? '').toUpperCase().trim()
    const entraPlaca = p.entra?.placa_norm ?? null
    const linhaPlaca = linhaMatch.placa_norm ?? null
    const mesmoMotorista = entraNomeNorm && linhaNomeNorm && entraNomeNorm === linhaNomeNorm
    const mesmaPlaca = entraPlaca && linhaPlaca && entraPlaca === linhaPlaca
    if (mesmoMotorista && mesmaPlaca) return p

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
