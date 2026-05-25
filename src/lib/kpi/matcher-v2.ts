/**
 * Matcher v2 — versão simplificada do cruzador escala × Unitrac.
 *
 * Filosofia (decisão do dono em 2026-05-24):
 *   "Tá na escala (com alteração aplicada) + bateu match exato no Unitrac → mostra.
 *    Não bateu → SEM/vazio. Em branco honesto > timestamp errado."
 *
 * Match EXATO apenas:
 *   1. codigo_loja (Unitrac) === codigo_unitrac (cadastro)
 *   2. nome_loja (Unitrac) === nome_unitrac (cadastro), normalizado
 *
 * Sem fallback geo/fuzzy/scorePair/parada compartilhada — fontes dos
 * falsos positivos Categoria B identificados na verificação dia 22.
 *
 * Foi extraído do matcher.ts (~1200 linhas) e simplificado pra ~150 linhas.
 */
import type { LinhaEscala } from '@/lib/types/escala'
import type { RotaKpi, ParadaKpi } from '@/lib/types/kpi'
import type { EscalaLinhaRow, UnitracParadaRow, LojaRow } from './matcher'
import { computeSaidaCdParaParadaV2 } from './matcher-v2-helpers'

function normalizar(s: string | null | undefined): string {
  if (!s) return ''
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

/**
 * Resolve qual loja CADASTRADA é a referência pra esta linha da escala.
 *
 * Estratégias (na ordem):
 *   1. Match por loja_codigo_raw == codigo_escala (se ambos preenchidos)
 *   2. Match por nome_normalizado exato
 *   3. Match por nome contém (loja.nome_normalizado dentro de escala.loja_nome_raw normalizado)
 *
 * Sem fuzzy/levenshtein/geo — só match determinístico.
 */
function resolveLojaCadastrada(
  linha: EscalaLinhaRow,
  lojas: LojaRow[],
): LojaRow | null {
  const lojasRede = lojas.filter(l => l.rede_id === linha.rede_id)
  if (lojasRede.length === 0) return null

  // 1. Por código de escala
  if (linha.loja_codigo_raw) {
    const byCode = lojasRede.find(l => l.codigo_escala === linha.loja_codigo_raw)
    if (byCode) return byCode
  }

  // 2. Por nome_normalizado exato
  const nomeNormEscala = normalizar(linha.loja_nome_raw)
  if (nomeNormEscala) {
    const byName = lojasRede.find(l => normalizar(l.nome_normalizado) === nomeNormEscala)
    if (byName) return byName

    // 3. Por contém — uma direção (escala_nome contém nome_normalizado da loja)
    const candidatos = lojasRede.filter(l => {
      const ln = normalizar(l.nome_normalizado)
      return ln.length >= 6 && nomeNormEscala.includes(ln)
    })
    if (candidatos.length === 1) return candidatos[0]
    // Múltiplos candidatos: tenta também direção reversa (nome da loja contém da escala)
    const reversos = lojasRede.filter(l => {
      const ln = normalizar(l.nome_normalizado)
      return ln.length >= 6 && ln.includes(nomeNormEscala)
    })
    if (reversos.length === 1) return reversos[0]
  }

  return null
}

/**
 * Acha a parada Unitrac que corresponde a esta loja, considerando APENAS match exato.
 */
function acharParadaParaLoja(
  paradasPlaca: UnitracParadaRow[],
  loja: LojaRow,
): UnitracParadaRow | null {
  // Filtra só LOJA (não BASE/FAKE_EXIT/FORA_BASE)
  const paradasLoja = paradasPlaca.filter(p => p.classificacao === 'LOJA')

  // 1. Match por código exato
  if (loja.codigo_unitrac) {
    const byCode = paradasLoja.find(p => p.codigo_loja === loja.codigo_unitrac)
    if (byCode) return byCode
  }

  // 2. Match por nome_unitrac exato
  if (loja.nome_unitrac) {
    const nomeLojaNorm = normalizar(loja.nome_unitrac)
    const byName = paradasLoja.find(p => normalizar(p.nome_loja) === nomeLojaNorm)
    if (byName) return byName
  }

  return null
}

export interface MatcherV2Stats {
  totalLinhas: number
  semPlaca: number
  semGps: number
  semLojaCadastrada: number
  semMatchParada: number
  matchedPorCodigo: number
  matchedPorNome: number
}

/**
 * Cruza escala (já com alterações aplicadas) × paradas Unitrac × cadastro de lojas.
 * Retorna RotaKpi[] no mesmo formato do matcher v1, mais um objeto de stats.
 */
export function cruzaEscalaUnitracV2(
  escala: EscalaLinhaRow[],
  paradas: UnitracParadaRow[],
  lojas: LojaRow[],
): { rotas: RotaKpi[]; stats: MatcherV2Stats } {
  const stats: MatcherV2Stats = {
    totalLinhas: escala.length,
    semPlaca: 0,
    semGps: 0,
    semLojaCadastrada: 0,
    semMatchParada: 0,
    matchedPorCodigo: 0,
    matchedPorNome: 0,
  }

  // Indexar paradas por placa
  const paradasPorPlaca = new Map<string, UnitracParadaRow[]>()
  for (const p of paradas) {
    if (!p.placa_norm) continue
    const arr = paradasPorPlaca.get(p.placa_norm) ?? []
    arr.push(p)
    paradasPorPlaca.set(p.placa_norm, arr)
  }

  const rotas: RotaKpi[] = []

  for (const linha of escala) {
    const baseRota: Omit<RotaKpi, 'paradas' | 'saida_cd' | 'status' | '_matchMeta'> = {
      escala_linha_id: linha.id,
      data: linha.data_entrega,
      rede_id: linha.rede_id,
      placa_norm: linha.placa_norm,
      anomalias_codigos: [],
    }

    // 1. Sem placa → SEM rastreador
    if (!linha.placa_norm) {
      stats.semPlaca++
      rotas.push({
        ...baseRota,
        paradas: [],
        saida_cd: null,
        status: 'sem_entrega',
        _matchMeta: { score: 0, confidence: 'UNMATCHED', requiresReview: false, algorithm: 'none' },
      })
      continue
    }

    // 2. Placa sem paradas no Unitrac → SEM rastreador
    const paradasPlaca = paradasPorPlaca.get(linha.placa_norm) ?? []
    if (paradasPlaca.length === 0) {
      stats.semGps++
      rotas.push({
        ...baseRota,
        paradas: [],
        saida_cd: null,
        status: 'sem_entrega',
        _matchMeta: { score: 0, confidence: 'UNMATCHED', requiresReview: false, algorithm: 'none' },
      })
      continue
    }

    // 3. Achar loja cadastrada
    const loja = resolveLojaCadastrada(linha, lojas)
    if (!loja) {
      stats.semLojaCadastrada++
      rotas.push({
        ...baseRota,
        paradas: [],
        saida_cd: null,
        status: 'pendente',
        _matchMeta: { score: 0, confidence: 'UNMATCHED', requiresReview: true, algorithm: 'none' },
      })
      continue
    }

    // 4. Achar parada da placa que corresponde à loja
    const parada = acharParadaParaLoja(paradasPlaca, loja)
    if (!parada) {
      stats.semMatchParada++
      rotas.push({
        ...baseRota,
        paradas: [],
        saida_cd: null,
        status: 'sem_entrega',
        _matchMeta: { score: 0, confidence: 'UNMATCHED', requiresReview: false, algorithm: 'none' },
      })
      continue
    }

    // Match identificado: classificar por que algoritmo
    if (parada.codigo_loja === loja.codigo_unitrac) stats.matchedPorCodigo++
    else stats.matchedPorNome++

    // 5. Calcular saída_cd (última BASE antes da parada)
    const saidaCd = computeSaidaCdParaParadaV2(parada, paradasPlaca, {
      redeId: linha.rede_id,
      data: linha.data_entrega,
    })

    const paradaKpi: ParadaKpi = {
      parada_id: parada.id,
      loja_id: loja.id,
      nome: parada.nome_loja ?? loja.nome,
      chegada: new Date(parada.chegada),
      saida: parada.saida ? new Date(parada.saida) : new Date(parada.chegada),
      duracao_min: parada.duracao_seg ? Math.round(parada.duracao_seg / 60) : 0,
      classificacao: 'LOJA',
    }

    rotas.push({
      ...baseRota,
      paradas: [paradaKpi],
      saida_cd: saidaCd,
      status: 'ok',
      _matchMeta: {
        score: 1,
        confidence: 'HIGH',
        requiresReview: false,
        algorithm: 'exact',
      },
    })
  }

  return { rotas, stats }
}
