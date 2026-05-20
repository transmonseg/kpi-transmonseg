import { levenshtein, normalizaNome } from '@/lib/utils/texto'
import { haversine } from '@/lib/utils/geo'
import type { RotaKpi, ParadaKpi } from '@/lib/types/kpi'
import { normalizeForScore } from '@/lib/utils/score'
import type { MatchMeta, MatchAlgorithm, MatchConfidence } from '@/lib/types/kpi'
import { batchTrgmLookup, type TrgmResult } from './trgm-lookup'
import { hungarianMin } from '@/lib/utils/hungarian'
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

/**
 * Quando o caminhão passa brevemente pela loja antes da entrega real (ex: motorista
 * verifica se a loja está aberta, gera parada de 5-9 min com o mesmo codigo_loja),
 * o Unitrac gera duas paradas LOJA com mesmo código. Fica com a de MAIOR duração
 * (a entrega real), que é a que Tia Érica anota no KPI manual.
 */
function deduplicarPorCodigo(paradas: UnitracParadaRow[]): UnitracParadaRow[] {
  const byCode = new Map<string, UnitracParadaRow>()
  const semCodigo: UnitracParadaRow[] = []
  for (const p of paradas) {
    if (!p.codigo_loja) { semCodigo.push(p); continue }
    const existing = byCode.get(p.codigo_loja)
    if (!existing || (p.duracao_seg ?? 0) > (existing.duracao_seg ?? 0)) {
      byCode.set(p.codigo_loja, p)
    }
  }
  return [...byCode.values(), ...semCodigo].sort(
    (a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime()
  )
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

  // Priority 2: exact nome_unitrac match (cadastrado igualzinho ao Unitrac)
  if (parada.nome_loja) {
    const nomeRaw = parada.nome_loja.trim()
    const byUnitracName = redeLojas.find(
      (l) => l.nome_unitrac && l.nome_unitrac.trim() === nomeRaw,
    )
    if (byUnitracName) return byUnitracName.id
  }

  // Priority 3: levenshtein on normalized name ≤ 2
  if (parada.nome_loja) {
    const normParada = normalizaNome(parada.nome_loja)
    const byName = redeLojas.find(
      (l) => levenshtein(normParada, l.nome_normalizado) <= 2,
    )
    if (byName) return byName.id
  }

  // Priority 4: geo proximity
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

/**
 * Score between one escala line and one Unitrac parada.
 * Returns 0 for exact code match, finite for name match, Infinity for no match.
 */
function scorePair(line: EscalaLinhaRow, p: UnitracParadaRow): number {
  let s = matchScore(line.loja_nome_raw, p.nome_loja || p.local_parada || '')
  if (line.loja_codigo_raw && p.codigo_loja) {
    const codL = line.loja_codigo_raw
    const codP = p.codigo_loja
    if (codL === codP || codP.endsWith(codL) || codL.endsWith(codP)) s = 0
  }
  return s
}

/**
 * Optimal bijection: escala linhas → Unitrac LOJA paradas. Minimizes total score.
 * For nL ≤ 5: brute-force (max ~15K iterations). For nL > 5: greedy.
 * Tie-breaking: linhas sorted alphabetically, paradas sorted chronologically —
 * ensures deterministic results for equal-score pairs (e.g. Caxias Centro vs Centenário).
 * Only assigns pairs with finite score; Infinity pairs left unmatched.
 */
function assignOptimal(
  linhas: EscalaLinhaRow[],
  paradas: UnitracParadaRow[],
): Map<string, UnitracParadaRow> {
  const result = new Map<string, UnitracParadaRow>()
  if (!linhas.length || !paradas.length) return result

  const ls = [...linhas].sort((a, b) => a.loja_nome_raw.localeCompare(b.loja_nome_raw))
  const ps = [...paradas].sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
  const nL = ls.length
  const nP = ps.length
  const INF = 1e9

  if (nL <= 5) {
    const mat = ls.map(l => ps.map(p => { const s = scorePair(l, p); return s === Infinity ? INF : s }))
    const n = Math.min(nL, nP)
    let bestTotal = Infinity
    let bestAssign: number[] = []

    const dfs = (li: number, usedP: Set<number>, cur: number[]) => {
      if (li === n) {
        const total = cur.reduce((sum, pi, i) => sum + mat[i][pi], 0)
        if (total < bestTotal) { bestTotal = total; bestAssign = [...cur] }
        return
      }
      for (let pi = 0; pi < nP; pi++) {
        if (!usedP.has(pi)) {
          usedP.add(pi); cur.push(pi)
          dfs(li + 1, usedP, cur)
          cur.pop(); usedP.delete(pi)
        }
      }
    }
    dfs(0, new Set(), [])

    for (let i = 0; i < bestAssign.length; i++) {
      const pi = bestAssign[i]
      if (mat[i][pi] < INF) result.set(ls[i].id, ps[pi])
    }
  } else {
    // Hungarian (Jonker-Volgenant) para nL > 5 — O(n³) optimal assignment.
    // Greedy podia errar em ambiguidades (ex: caminhão Princesa fazendo 8
    // entregas onde duas lojas têm nomes parecidos). Hungarian garante
    // minimização global da soma de scores.
    const mat = ls.map(l => ps.map(p => scorePair(l, p)))
    const assignment = hungarianMin(mat)
    for (let li = 0; li < nL; li++) {
      const pi = assignment[li]
      if (pi >= 0 && Number.isFinite(mat[li][pi])) {
        result.set(ls[li].id, ps[pi])
      }
    }
  }
  return result
}

export async function cruzaEscalaUnitrac(
  escalaLinhas: EscalaLinhaRow[],
  paradaRows: UnitracParadaRow[],
  lojas: LojaRow[],
  supabase?: SupabaseClient,
  geoStores?: GeoStore[],
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
  const geoMatchedLineIds = new Set<string>()
  const matchByEscalaId = new Map<string, UnitracParadaRow>()
  for (const [placa, linhas] of escalaByPlaca) {
    const todas = paradaByPlaca.get(placa) ?? []
    const lojasParadasRaw = todas.filter((p) => p.classificacao === 'LOJA')
    const lojasConsolidadas = consolidarParadasMesmoCliente(lojasParadasRaw)
    // Remove paradas curtas duplicadas do mesmo codigo_loja: mantém só a de maior duração
    const lojasParadas = deduplicarPorCodigo(lojasConsolidadas)
    const usados = new Set<string>()

    // Optimal assignment: para n≤5 linhas usa brute-force (minimiza total score);
    // para n>5 greedy. Linhas ordenadas por nome, paradas por chegada —
    // desempate determinístico para nomes ambíguos (ex: Caxias Centro vs Centenário).
    const assigned = assignOptimal(linhas, lojasParadas)
    for (const [lineId, parada] of assigned) {
      matchByEscalaId.set(lineId, parada)
      usados.add(parada.id)
    }

    // Temporal fallback: linhas ainda sem match recebem paradas restantes em
    // ordem cronológica, MAS SÓ se a parada pertencer plausivelmente à rede da
    // escala (resolveLojaId bate com loja da rede, ou nome tem tokens em comum).
    //
    // ANTES: atribuía qualquer parada restante por ordem cronológica → caminhão
    // que faz cross-docking (Armazém Grão entregando em PREZUNIC TIJUCA, GB
    // MADUREIRA) gerava match errado pra linhas da própria escala. Resultado:
    // KPI mostrava horários de loja totalmente diferente da escala.
    //
    // AGORA: só atribui se (a) scorePair < Infinity (tokens compartilham
    // palavra core) OU (b) resolveLojaId casa a parada com alguma loja
    // cadastrada da rede daquela escala. Caso contrário, deixa UNMATCHED.
    const linhasSemMatch = linhas.filter(l => !matchByEscalaId.has(l.id))
    const paradasLivres = lojasParadas.filter(p => !usados.has(p.id))
    if (linhasSemMatch.length > 0 && paradasLivres.length > 0) {
      const linhasOrdenadas = [...linhasSemMatch].sort((a, b) => a.loja_nome_raw.localeCompare(b.loja_nome_raw))
      const paradasOrdenadas = [...paradasLivres].sort(
        (a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime()
      )
      // Pré-computa "rede provável" de cada parada via resolveLojaId em todas as
      // redes. Uma parada de PREZUNIC TIJUCA volta com rede_id = PREZUNIC e fica
      // bloqueada pra escalas da ARMAZEM_GRAO.
      const redesPresentes = [...new Set(lojas.map(l => l.rede_id))]
      const paradaRede = new Map<string, string | null>()
      for (const p of paradasOrdenadas) {
        let achou: string | null = null
        for (const r of redesPresentes) {
          if (resolveLojaId(p, lojas, r)) { achou = r; break }
        }
        paradaRede.set(p.id, achou)
      }

      const usadosFallback = new Set<number>()
      for (let i = 0; i < linhasOrdenadas.length; i++) {
        const linha = linhasOrdenadas[i]
        let melhorIdx = -1
        for (let j = 0; j < paradasOrdenadas.length; j++) {
          if (usadosFallback.has(j)) continue
          const parada = paradasOrdenadas[j]
          const redeDaParada = paradaRede.get(parada.id)
          // Bloqueia se a parada pertence CLARAMENTE a outra rede
          if (redeDaParada && redeDaParada !== linha.rede_id) continue
          // (a) tokens compartilhados no nome
          if (scorePair(linha, parada) < Infinity) {
            melhorIdx = j
            break
          }
          // (b) parada bate com loja da rede da escala
          if (redeDaParada === linha.rede_id) {
            melhorIdx = j
            break
          }
          // (c) parada não bate com nenhuma rede conhecida — aceita (era o
          // comportamento antigo, só agora bloqueado pelas regras acima quando
          // a parada é claramente de outra rede)
          if (redeDaParada === null) {
            melhorIdx = j
            break
          }
        }
        if (melhorIdx >= 0) {
          matchByEscalaId.set(linha.id, paradasOrdenadas[melhorIdx])
          usados.add(paradasOrdenadas[melhorIdx].id)
          usadosFallback.add(melhorIdx)
        }
      }
    }

    // Geo fallback for Category B: FORA_BASE stops near canonical_loja coordinates
    if (geoStores && geoStores.length > 0) {
      const linhasAindaSemMatch = linhas.filter(l => !matchByEscalaId.has(l.id))
      if (linhasAindaSemMatch.length > 0) {
        const paradasForaBase = todas
          .filter(p =>
            p.classificacao === 'FORA_BASE' &&
            p.lat != null && p.lng != null &&
            !usados.has(p.id)
          )
          .sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())

        const paradasGeoResolved = paradasForaBase.filter(p =>
          resolveForaBaseGeo(p.lat!, p.lng!, geoStores) !== null
        )

        for (let i = 0; i < Math.min(linhasAindaSemMatch.length, paradasGeoResolved.length); i++) {
          matchByEscalaId.set(linhasAindaSemMatch[i].id, paradasGeoResolved[i])
          usados.add(paradasGeoResolved[i].id)
          geoMatchedLineIds.add(linhasAindaSemMatch[i].id)
        }
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
    // Saída CD: última saída da BASE BENASSI antes da primeira parada operacional.
    // "Operacional" = primeira LOJA, ou primeira FORA_BASE DEPOIS de ter visitado a BASE.
    // FORA_BASE de madrugada (antes de ir pra base) é ignorada — o caminhão pode ter
    // começado o tracking longe do CD sem isso indicar início das entregas.
    let viuBase = false
    let firstRealStop: UnitracParadaRow | undefined = undefined
    for (const p of todasParadas) {
      const isBaseLike =
        p.classificacao === 'BASE' ||
        (p.classificacao === 'FAKE_EXIT' && p.local_parada.startsWith('BASE BENASSI'))
      if (isBaseLike) {
        viuBase = true
        continue
      }
      if (p.classificacao === 'LOJA') {
        firstRealStop = p
        break
      }
      if (viuBase && p.classificacao === 'FORA_BASE') {
        firstRealStop = p
        break
      }
    }
    const firstRealTime = firstRealStop
      ? new Date(firstRealStop.chegada).getTime()
      : Infinity

    let saida_cd: Date | null = null
    for (const p of todasParadas) {
      const isBase =
        p.classificacao === 'BASE' ||
        (p.classificacao === 'FAKE_EXIT' && p.local_parada.startsWith('BASE BENASSI'))
      if (isBase && p.saida) {
        const saidaDate = new Date(p.saida)
        if (saidaDate.getTime() < firstRealTime) {
          if (!saida_cd || saidaDate.getTime() > saida_cd.getTime()) {
            saida_cd = saidaDate
          }
        }
      }
    }

    // Em vez de todas as paradas não-base, emite SÓ a parada matched por nome
    const matched = matchByEscalaId.get(linha.id)
    const isGeo = geoMatchedLineIds.has(linha.id)

    let lojaId: string | null = null
    let nomeResolvido: string = ''
    let metaAlgorithm: MatchAlgorithm = 'hybrid'

    if (matched) {
      const nomeRaw = matched.nome_loja ?? matched.local_parada ?? ''
      lojaId = resolveLojaId(matched, lojas, linha.rede_id)
      nomeResolvido = nomeRaw

      if (isGeo) {
        metaAlgorithm = 'geo'
      } else if (!lojaId && trgmResults[linha.loja_nome_raw]) {
        // trgm fallback: enriquece loja_id quando resolveLojaId retornou null
        const trgm = trgmResults[linha.loja_nome_raw]
        lojaId = trgm.canonical_id
        nomeResolvido = trgm.canonical_nm
        metaAlgorithm = 'trgm'
      }
    }

    const paradas: ParadaKpi[] = matched
      ? [{
          parada_id: matched.id,
          loja_id: lojaId,
          nome: nomeResolvido,
          chegada: new Date(matched.chegada),
          saida: matched.saida ? new Date(matched.saida) : new Date(matched.chegada),
          duracao_min: Math.round((matched.duracao_seg ?? 0) / 60),
          classificacao: isGeo ? 'FORA_BASE' : 'LOJA',
        }]
      : []

    const metaScore = isGeo ? 0.8 : metaAlgorithm === 'trgm'
      ? (trgmResults[linha.loja_nome_raw]?.trgm_score ?? 0.7)
      : 1.0

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
        ? { score: metaScore, confidence: isGeo ? 'LOW' : 'HIGH', requiresReview: false, algorithm: metaAlgorithm }
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

export interface GeoStore {
  id: string
  name: string
  lat: number | null
  lng: number | null
  raio_metros: number
}

/**
 * For a FORA_BASE stop with coordinates, finds the nearest canonical_loja
 * within its raio_metros. Returns the store or null.
 * haversine() returns meters.
 */
export function resolveForaBaseGeo(lat: number, lng: number, stores: GeoStore[]): GeoStore | null {
  let best: GeoStore | null = null
  let bestDist = Infinity

  for (const store of stores) {
    if (store.lat == null || store.lng == null) continue
    const distM = haversine(lat, lng, store.lat, store.lng)
    if (distM <= store.raio_metros && distM < bestDist) {
      best = store
      bestDist = distM
    }
  }
  return best
}
