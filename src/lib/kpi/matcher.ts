import { levenshtein, normalizaNome } from '@/lib/utils/texto'
import { haversine } from '@/lib/utils/geo'
import type { RotaKpi, ParadaKpi } from '@/lib/types/kpi'
import { normalizeForScore } from '@/lib/utils/score'
import type { MatchMeta, MatchAlgorithm, MatchConfidence } from '@/lib/types/kpi'
import { batchTrgmLookup, type TrgmResult } from './trgm-lookup'
import type { SupabaseClient } from '@supabase/supabase-js'

// Tokeniza nome de loja pra match fuzzy: remove acentos, parênteses (1ª Entrega), redes,
// stopwords (DO, DE, DA, SAO), retorna set de tokens significativos.
const REDES_TOKEN = new Set([
  'PRINCESA','PREZUNIC','ASSAI','ASSAÍ','CARREFOUR','SUPERPRIX','SUPER','PRIX','PAX',
  'SENDAS','GUANABARA','MUNDIAL','VIANENSE','EMANUEL','SAMS','ATACADAO','FEIRA','NOVA',
  'CAB','PETROPOLIS','ARMAZEM','GRAO','ZONA','SUL','MERCADO','SUPERMERCADO',
])
const STOPWORDS = new Set(['DO','DE','DA','DOS','DAS','SAO','SÃO','LOJA','REDE'])

function tokensCore(s: string | null | undefined): Set<string> {
  if (!s) return new Set()
  // Unitrac às vezes concatena várias paradas separadas por vírgula
  // (ex: "PRINCESA MARICÁ 1,5353012 - REGINA BARRA..."). Pega só a primeira
  // parada (antes da primeira vírgula) pra evitar match cross-loja.
  const primeiraParada = String(s).split(',')[0]
  const norm = primeiraParada.toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d+\s*[ªº°AO]?\s*ENTREGA/gi, ' ')
  const out = new Set<string>()
  for (const t of norm.split(/[^A-Z0-9]+/)) {
    if (!t) continue
    // Filtra letras soltas (S de "LARANJEIRA S") mas MANTÉM dígitos isolados (números de loja)
    if (t.length === 1 && /^[A-Z]$/.test(t)) continue
    if (REDES_TOKEN.has(t) || STOPWORDS.has(t)) continue
    out.add(t)
  }
  return out
}

function extraiNumero(tokens: Set<string>): string | null {
  // Pega só números curtos (1-3 dígitos) que são identificadores de loja
  // (Buzios 1, Loja 18, etc). Códigos longos do Unitrac (9039018, 8590563)
  // são internos e não devem ser tratados como "número da loja" no match.
  for (const t of tokens) if (/^\d{1,3}$/.test(t)) return t
  return null
}

// Token mais longo (loja core), excluindo numeros
function tokenPrincipal(tokens: Set<string>): string {
  let best = ''
  for (const t of tokens) {
    if (/^\d+$/.test(t)) continue
    if (t.length > best.length) best = t
  }
  return best
}

// Score: Infinity = no match, lower = better. Considera obrigatório bater número de loja.
function matchScore(escalaNome: string, paradaNome: string): number {
  const tl = tokensCore(escalaNome)
  const tp = tokensCore(paradaNome)
  if (tl.size === 0 || tp.size === 0) return Infinity

  const nL = extraiNumero(tl)
  const nP = extraiNumero(tp)
  if (nL !== null && nP !== null && nL !== nP) return Infinity

  let common = 0
  for (const t of tl) if (tp.has(t)) common++

  if (common === 0) {
    // Fallback fuzzy: parser do Unitrac as vezes corta letras (LARANJEIRAS -> LARANJEIRA,
    // COPACABANA -> COPACABAN). Tenta Levenshtein no token principal.
    const coreL = tokenPrincipal(tl)
    const coreP = tokenPrincipal(tp)
    if (coreL.length >= 5 && coreP.length >= 5) {
      const dist = levenshtein(coreL, coreP)
      // Aceita ate 2 letras de diferenca em palavras de 5+ chars (plural, truncamento)
      if (dist <= 2) return Math.max(tl.size, tp.size) + dist
    }
    return Infinity
  }

  return Math.max(tl.size, tp.size) - common
}

type EscalaLinhaRow = {
  id: string
  rede_id: string
  placa_norm: string | null
  loja_nome_raw: string
  loja_codigo_raw: string | null
  motorista_nome: string | null
  carro_ordem: number
  data_entrega: string
}

type UnitracParadaRow = {
  id: string
  placa_norm: string
  chegada: string
  saida: string | null
  duracao_seg: number | null
  local_parada: string
  codigo_loja: string | null
  nome_loja: string | null
  lat: number | null
  lng: number | null
  classificacao: string
  ordem: number
}

type LojaRow = {
  id: string
  rede_id: string
  nome: string
  nome_normalizado: string
  codigo_escala: string | null
  codigo_unitrac: string | null
  nome_unitrac: string | null
  lat: number | null
  lng: number | null
  raio_metros: number
}

/**
 * Consolida paradas LOJA consecutivas com mesmo codigo_loja em UMA só parada.
 *
 * Cenário (confirmado pela Tia Érica nos vídeos): quando o caminhão entrega
 * num cliente, ele pode "pular pra rua lateral" e voltar, gerando 2-3
 * registros consecutivos com o mesmo Local da Parada no Unitrac. A
 * interpretação correta é UMA parada: chegada = primeira, saída = última.
 *
 * Mantém ordem temporal, só junta paradas LOJA com codigo_loja não-nulo iguais.
 */
function consolidarParadasMesmoCliente(paradas: UnitracParadaRow[]): UnitracParadaRow[] {
  const out: UnitracParadaRow[] = []
  for (const p of paradas) {
    const last = out[out.length - 1]
    const mesmaLoja =
      last &&
      last.classificacao === 'LOJA' &&
      p.classificacao === 'LOJA' &&
      last.codigo_loja &&
      p.codigo_loja &&
      last.codigo_loja === p.codigo_loja
    if (mesmaLoja && last.saida && p.saida && last.chegada) {
      last.saida = p.saida
      last.duracao_seg = Math.round(
        (new Date(p.saida).getTime() - new Date(last.chegada).getTime()) / 1000,
      )
    } else {
      out.push({ ...p })
    }
  }
  return out
}

function resolveLojaId(
  parada: UnitracParadaRow,
  lojas: LojaRow[],
  redeId: string,
): string | null {
  const redeLojas = lojas.filter((l) => l.rede_id === redeId)

  // Priority 1: exact code match
  if (parada.codigo_loja) {
    const byCode = redeLojas.find((l) => l.codigo_unitrac === parada.codigo_loja)
    if (byCode) return byCode.id
  }

  // Priority 2: levenshtein on normalized name ≤ 2
  if (parada.nome_loja) {
    const normParada = normalizaNome(parada.nome_loja)
    const byName = redeLojas.find(
      (l) => levenshtein(normParada, l.nome_normalizado) <= 2,
    )
    if (byName) return byName.id
  }

  // Priority 3: geo proximity
  if (parada.lat != null && parada.lng != null) {
    const byGeo = redeLojas.find(
      (l) =>
        l.lat != null &&
        l.lng != null &&
        haversine(parada.lat!, parada.lng!, l.lat, l.lng) <= l.raio_metros,
    )
    if (byGeo) return byGeo.id
  }

  return null
}

// Pares de chars que o parser PDF do Unitrac confunde por causa do tipo Mercosul:
// 1↔B (idx 4 da Mercosul), 9↔J, 4↔E. Cada par é equivalente em uma posição.
const OCR_PARES: Record<string, string> = { '1':'B', 'B':'1', '9':'J', 'J':'9', '4':'E', 'E':'4' }

// Gera variantes da placa com 1 substituição OCR (até 1 char diferente).
// Limita à posição 4 (zero-indexed) que é onde Mercosul muda de dígito pra letra.
function variantesOcr(placa: string): string[] {
  if (placa.length !== 7) return [placa]
  const variantes = new Set([placa])
  const ch = placa[4]
  const sub = OCR_PARES[ch]
  if (sub) variantes.add(placa.slice(0, 4) + sub + placa.slice(5))
  return [...variantes]
}

export async function cruzaEscalaUnitrac(
  escalaLinhas: EscalaLinhaRow[],
  paradaRows: UnitracParadaRow[],
  lojas: LojaRow[],
  supabase?: SupabaseClient,
): Promise<RotaKpi[]> {
  // Pre-fetch batch trgm para todos os nomes de loja desta execucao
  let trgmResults: Record<string, TrgmResult> = {}
  if (supabase) {
    const allNames = [...new Set(
      escalaLinhas.map(e => e.loja_nome_raw).filter(Boolean)
    )] as string[]
    trgmResults = await batchTrgmLookup(supabase, allNames)
  }

  const paradaByPlaca = new Map<string, UnitracParadaRow[]>()
  for (const p of paradaRows) {
    const list = paradaByPlaca.get(p.placa_norm) ?? []
    list.push(p)
    paradaByPlaca.set(p.placa_norm, list)
  }
  for (const [placa, list] of paradaByPlaca) {
    paradaByPlaca.set(
      placa,
      list.sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime()),
    )
  }

  // Resolve a placa real no Unitrac considerando OCR alternativo (Mercosul pos 4).
  // SÓ aceita variante OCR se for ÚNICA no Unitrac (sem ambiguidade).
  function resolvePlacaUnitrac(placaEscala: string): string | null {
    if (paradaByPlaca.has(placaEscala)) return placaEscala
    const variantes = variantesOcr(placaEscala).filter(v => v !== placaEscala)
    const presentes = variantes.filter(v => paradaByPlaca.has(v))
    if (presentes.length === 1) return presentes[0]
    return null
  }

  // Mapa: escala_linha_id -> placa do Unitrac (resolvendo OCR-confusable)
  const placaResolvida = new Map<string, string>()
  for (const l of escalaLinhas) {
    if (!l.placa_norm) continue
    const resolved = resolvePlacaUnitrac(l.placa_norm)
    if (resolved) placaResolvida.set(l.id, resolved)
  }

  // Agrupa escala_linhas pela placa RESOLVIDA pra fazer matching parada↔linha
  const escalaByPlaca = new Map<string, EscalaLinhaRow[]>()
  for (const l of escalaLinhas) {
    const placa = placaResolvida.get(l.id)
    if (!placa) continue
    const list = escalaByPlaca.get(placa) ?? []
    list.push(l)
    escalaByPlaca.set(placa, list)
  }

  // Pra cada placa, atribui paradas LOJA às escala_linhas correspondentes (greedy por melhor match)
  const matchByEscalaId = new Map<string, UnitracParadaRow>()
  for (const [placa, linhas] of escalaByPlaca) {
    const todas = paradaByPlaca.get(placa) ?? []
    const lojasParadasRaw = todas.filter((p) => p.classificacao === 'LOJA')
    const lojasParadas = consolidarParadasMesmoCliente(lojasParadasRaw)
    const usados = new Set<string>()

    // Coleta todos os pares (linha, parada, score) e ordena por score crescente
    const candidatos: Array<{ lineId: string; parada: UnitracParadaRow; score: number }> = []
    for (const line of linhas) {
      for (const p of lojasParadas) {
        let score = matchScore(line.loja_nome_raw, p.nome_loja || p.local_parada || '')
        // Boost cod match: escala "Loja 18" cod="18" ↔ Unitrac cod_loja="9039018"
        // (codigo Unitrac com prefixo de rede + número de loja sufixo)
        if (line.loja_codigo_raw && p.codigo_loja) {
          const codL = line.loja_codigo_raw
          const codP = p.codigo_loja
          if (codL === codP || codP.endsWith(codL) || codL.endsWith(codP)) {
            score = 0 // override pra sinal forte de mesma loja
          }
        }
        if (score < Infinity) candidatos.push({ lineId: line.id, parada: p, score })
      }
    }
    candidatos.sort((a, b) => a.score - b.score)

    // Atribui greedily: linha pega primeira parada disponível com melhor score
    for (const c of candidatos) {
      if (matchByEscalaId.has(c.lineId)) continue
      if (usados.has(c.parada.id)) continue
      matchByEscalaId.set(c.lineId, c.parada)
      usados.add(c.parada.id)
    }

    // Fallback temporal: se sobrarem linhas sem match E paradas LOJA não usadas,
    // atribui por ordem cronológica. Útil quando Unitrac dá várias paradas com mesmo
    // cod (Regina/Armazém Grão) e o fuzzy match não consegue separar.
    const linhasSemMatch = linhas.filter(l => !matchByEscalaId.has(l.id))
    const paradasLivres = lojasParadas.filter(p => !usados.has(p.id))
    if (linhasSemMatch.length > 0 && paradasLivres.length > 0) {
      // Ordena linhas por raw_row_num (ordem de aparição na escala) — proxy de ordem
      const linhasOrdenadas = [...linhasSemMatch]
      const paradasOrdenadas = [...paradasLivres].sort(
        (a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime()
      )
      for (let i = 0; i < Math.min(linhasOrdenadas.length, paradasOrdenadas.length); i++) {
        matchByEscalaId.set(linhasOrdenadas[i].id, paradasOrdenadas[i])
        usados.add(paradasOrdenadas[i].id)
      }
    }
  }

  const rotas: RotaKpi[] = []

  for (const linha of escalaLinhas) {
    if (!linha.placa_norm) {
      rotas.push({
        escala_linha_id: linha.id,
        data: linha.data_entrega,
        rede_id: linha.rede_id,
        placa_norm: null,
        saida_cd: null,
        paradas: [],
        anomalias_codigos: [],
        status: 'sem_entrega',
        _matchMeta: { score: 0, confidence: 'UNMATCHED', requiresReview: false, algorithm: 'none' },
      })
      continue
    }

    const placaUnitrac = placaResolvida.get(linha.id) ?? linha.placa_norm
    const todasParadas = paradaByPlaca.get(placaUnitrac) ?? []
    const semFake = todasParadas.filter((p) => p.classificacao !== 'FAKE_EXIT')

    const firstNonBase = semFake.find((p) => p.classificacao !== 'BASE')
    const firstNonBaseTime = firstNonBase ? new Date(firstNonBase.chegada).getTime() : Infinity

    let saida_cd: Date | null = null
    for (const p of semFake) {
      if (p.classificacao === 'BASE' && p.saida) {
        const saidaDate = new Date(p.saida)
        if (saidaDate.getTime() < firstNonBaseTime) {
          if (!saida_cd || saidaDate.getTime() > saida_cd.getTime()) {
            saida_cd = saidaDate
          }
        }
      }
    }

    // Em vez de todas as paradas não-base, emite SÓ a parada matched por nome
    const matched = matchByEscalaId.get(linha.id)
    const paradas: ParadaKpi[] = matched
      ? [{
          parada_id: matched.id,
          loja_id: resolveLojaId(matched, lojas, linha.rede_id),
          nome: matched.nome_loja ?? matched.local_parada,
          chegada: new Date(matched.chegada),
          saida: matched.saida ? new Date(matched.saida) : new Date(matched.chegada),
          duracao_min: Math.round((matched.duracao_seg ?? 0) / 60),
          classificacao: 'LOJA',
        }]
      : []

    rotas.push({
      escala_linha_id: linha.id,
      data: linha.data_entrega,
      rede_id: linha.rede_id,
      placa_norm: linha.placa_norm,
      saida_cd,
      paradas,
      anomalias_codigos: [],
      status: 'pendente',
      _matchMeta: matched
        ? { score: 1.0, confidence: 'HIGH', requiresReview: false, algorithm: 'hybrid' }
        : { score: 0, confidence: 'UNMATCHED', requiresReview: true, algorithm: 'none' },
    })
  }

  return rotas
}

export interface ResolveContext {
  aliases: Record<string, { canonical_nm: string; canonical_id: string; score: number }>
  trgmResults: Record<string, TrgmResult>
}

/**
 * Pure 3-path algorithm — no side effects.
 * Path 1: exact alias (HIGH if score >= 0.85, LOW if < 0.85)
 * Path 2: trgm fuzzy >= 0.6 (HIGH if score >= 0.85, LOW otherwise)
 * Path 3: no match → UNMATCHED + requiresReview=true
 */
export function resolveStoreName3Path(rawName: string, ctx: ResolveContext): MatchMeta {
  const norm = normalizeForScore(rawName)

  // Path 1: exact alias
  const alias = ctx.aliases[norm]
  if (alias) {
    return {
      score: alias.score,
      confidence: alias.score >= 0.85 ? 'HIGH' : 'LOW',
      requiresReview: alias.score < 0.6,
      algorithm: 'alias',
    }
  }

  // Path 2: trgm fuzzy
  const trgm = ctx.trgmResults[rawName] ?? ctx.trgmResults[norm]
  if (trgm && trgm.trgm_score >= 0.6) {
    return {
      score: trgm.trgm_score,
      confidence: trgm.trgm_score >= 0.85 ? 'HIGH' : 'LOW',
      requiresReview: trgm.trgm_score < 0.75,
      algorithm: 'trgm',
    }
  }

  // Path 3: no match
  return {
    score: trgm?.trgm_score ?? 0,
    confidence: 'UNMATCHED',
    requiresReview: true,
    algorithm: 'none',
  }
}
