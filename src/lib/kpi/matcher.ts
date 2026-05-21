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
  'CAB','ARMAZEM','GRAO','ZONA','SUL','MERCADO','SUPERMERCADO',
  // PETROPOLIS removido: é nome de cidade (Petrópolis RJ), não de rede — filtrar impede
  // que "CAB PETROPOLIS" bata com "7012010 - CAB - PETROPOLIS" via token "PETROPOLIS".
])
// IMPORTANTE: "SAO/SÃO" foi removida das stopwords. Filtrava "São Gonçalo"
// virando só {GONCALO} e batia falso-positivo com qualquer outra rota "GONCALO".
// "Sao Joao de Meriti" idem. Bairros RJ usam "SAO X" extensivamente.
const STOPWORDS = new Set(['DO','DE','DA','DOS','DAS','LOJA','REDE'])

// Prefixos numéricos conhecidos dos códigos do Unitrac (`codigo_loja`) por rede.
// Quando o codigo_loja começa com um destes, o suffix-match aceita codigo_escala
// de length>=2 (com padStart 3) — destrava match Zona Sul "21" → 9039021,
// Superprix "14" → 3030014, Carrefour "12" → 9006012 etc.
// Validado contra `lojas.codigo_unitrac` no DB Supabase em 21/05/2026.
// Família 710[0-3] cobre Guanabara (7100/7101/7102/7103); 5600 cobre SENDAS.
// Prefixos rigorosos (4+ chars onde possível) pra minimizar falso positivo.
const REDE_PREFIX_RE = /^(9039|3030|7000|8590|5353|5790|9006|710[0-3]|5600|11623|17659|2384|7012|202)/

// Suffix-match entre `codigo_escala` da escala e `codigo_loja` do Unitrac.
// Regras:
//   1. igualdade exata
//   2. suffix de codigo_escala length>=3 dentro de codigo_loja
//   3. suffix inverso (codigo_loja contém o sufixo codigo_escala)
//   4-5. quando codigo_loja tem prefixo de rede conhecido, aceitar length>=2
//        (com padStart(3,'0') pra cobrir "09" → "009" → 9039009)
// Encapsulada pra DRY entre scorePair (geofence principal) e o fallback
// de partes em local_parada separadas por vírgula.
function codCasa(codL: string, codP: string): boolean {
  if (codL === codP) return true
  if (codL.length >= 3 && codP.endsWith(codL)) return true
  if (codP.length >= 3 && codL.endsWith(codP)) return true
  // Quando codP tem prefixo de rede conhecido E codL tem length=2,
  // aceitar SÓ via padStart(3,'0') — todos os codigos_unitrac cadastrados são
  // `prefixo + 3 dígitos`, então "21" → "021" é a única forma correta.
  // Aceitar codP.endsWith(codL) sem padStart faria 9039121 casar com codL="21".
  if (codL.length >= 2 && REDE_PREFIX_RE.test(codP) && codP.endsWith(codL.padStart(3, '0'))) return true
  return false
}

function tokensCore(s: string | null | undefined): Set<string> {
  if (!s) return new Set()
  // Unitrac às vezes concatena várias paradas separadas por vírgula
  // (ex: "PRINCESA MARICÁ 1,5353012 - REGINA BARRA..."). Pega só a primeira
  // parada (antes da primeira vírgula) pra evitar match cross-loja.
  const primeiraParada = String(s).split(',')[0]
  const norm = primeiraParada.toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Remove só parênteses com marcador de entrega — "(1ª Entrega)", "(2° Entrega)", "(Entrega Extra)".
    // ANTES: `\([^)]*\)` apagava TUDO entre parênteses, incluindo discriminadores de loja
    // ("ARMAZÉM DO GRÃO (ITAIPAVA)" virava "ARMAZÉM DO GRÃO" → token vazio).
    .replace(/\(\s*\d+\s*[ªº°AO]?\s*ENTREGAS?\s*\)/gi, ' ')
    .replace(/\(\s*ENTREGAS?\s+EXTRA\s*\)/gi, ' ')
    // Pra demais parênteses, manter o conteúdo (é discriminador) — só remove os símbolos
    .replace(/[()]/g, ' ')
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

function extraiNumeros(tokens: Set<string>): Set<string> {
  // Retorna TODOS os números curtos (1-3 dígitos) — identificadores de loja
  // (Buzios 1, Loja 18, etc). Códigos longos do Unitrac (9039018, 8590563)
  // são internos e não devem ser tratados como "número da loja" no match.
  //
  // ANTES retornava o primeiro encontrado (Set não tem ordem garantida em
  // todos os engines) — fazia matchScore comparar números diferentes e dar
  // Infinity em pares que deveriam casar.
  const out = new Set<string>()
  for (const t of tokens) if (/^\d{1,3}$/.test(t)) out.add(t)
  return out
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

  // Se AMBOS têm número de loja e os conjuntos não têm nenhum em comum,
  // rejeita. (Buzios 1 vs Buzios 2 → Infinity. Cabo Frio 3 vs Cabo Frio 3 → ok.)
  const numsL = extraiNumeros(tl)
  const numsP = extraiNumeros(tp)
  if (numsL.size > 0 && numsP.size > 0) {
    let temComum = false
    for (const n of numsL) if (numsP.has(n)) { temComum = true; break }
    if (!temComum) return Infinity
  }

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

export type EscalaLinhaRow = {
  id: string
  rede_id: string
  placa_norm: string | null
  loja_nome_raw: string
  loja_codigo_raw: string | null
  motorista_nome: string | null
  carro_ordem: number
  data_entrega: string
}

export type UnitracParadaRow = {
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

export type LojaRow = {
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
    if (mesmaLoja) {
      // Antes: exigia ambos saida e chegada não-null. Quando p.saida era null
      // (caminhão ainda parado, última parada do dia), caía no else e empurrava
      // parada repetida — depois `deduplicarPorCodigo` descartava uma e podia
      // sumir a que tinha chegada válida. Agora consolida sempre que mesmaLoja.
      const novaSaida = p.saida ?? last.saida
      last.saida = novaSaida
      if (last.chegada && novaSaida) {
        last.duracao_seg = Math.round(
          (new Date(novaSaida).getTime() - new Date(last.chegada).getTime()) / 1000,
        )
      }
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
    // Parada com saida=null significa parada em aberto (veículo ainda no local ou
    // dado ainda não fechado). Tratamos como duração máxima (Infinity) para que uma
    // parada em aberto nunca seja descartada em favor de uma parada já encerrada.
    const duracaoP = p.saida === null ? Infinity : (p.duracao_seg ?? 0)
    const duracaoExisting = existing && existing.saida === null ? Infinity : (existing?.duracao_seg ?? 0)
    if (!existing || duracaoP > duracaoExisting) {
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

  // Priority 2: nome_unitrac match (normalizado: trim + upper + sem acento)
  if (parada.nome_loja) {
    const normPar = parada.nome_loja
      .trim().toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
    const byUnitracName = redeLojas.find((l) => {
      if (!l.nome_unitrac) return false
      const normLoja = l.nome_unitrac.trim().toUpperCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
      return normLoja === normPar
    })
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
// 1↔B, 9↔J, 4↔E, 6↔G, 7↔H, 8↔I. Cada par é equivalente na posição 4 (Mercosul).
const OCR_PARES: Record<string, string> = {
  '1':'B', 'B':'1',
  '4':'E', 'E':'4',
  '6':'G', 'G':'6',
  '7':'H', 'H':'7',
  '8':'I', 'I':'8',
  '9':'J', 'J':'9',
}

// Gera variantes da placa com 1 substituição OCR (até 1 char diferente).
// Limita à posição 4 (zero-indexed) que é onde Mercosul muda de dígito pra letra.
export function variantesOcr(placa: string): string[] {
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
 *
 * Exported para teste — também reexportado abaixo via `__scorePairForTests`
 * (não usar fora de testes).
 */
export function scorePair(line: EscalaLinhaRow, p: UnitracParadaRow): number {
  let s = matchScore(line.loja_nome_raw, p.nome_loja || p.local_parada || '')
  if (line.loja_codigo_raw && p.codigo_loja) {
    if (codCasa(line.loja_codigo_raw, p.codigo_loja)) s = 0
  }
  // Tenta geofences adicionais (Unitrac concatena múltiplas separadas por vírgula).
  // O parser só salva codigo_loja/nome_loja da PRIMEIRA geofence LOJA; quando a
  // relevante é a 2ª/3ª, sem isso o pair recebe Infinity e perde o match.
  // Exemplo: Escala ALHAMBRA (21469000) vs Unitrac "17659001 - O BOM CAMPO
  // GRANDE,21469000 - EMANUEL ALHAMBRA".
  if (s > 0 && p.local_parada) {
    const partes = p.local_parada.split(',').map(t => t.trim())
    for (const parte of partes) {
      const m = parte.match(/^(\d{4,})\s*-\s*(.+)/)
      if (!m) continue
      const codP2 = m[1]
      const nomePart = m[2].trim()
      if (line.loja_codigo_raw && codCasa(line.loja_codigo_raw, codP2)) {
        s = 0
        break
      }
      const nomeScore = matchScore(line.loja_nome_raw, nomePart)
      if (nomeScore < s) s = nomeScore
    }
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
    // n = how many assignments we make: bounded by both nL and nP.
    // When nL <= nP every line can get a parada; when nL > nP only nP of nL lines get assigned.
    const n = Math.min(nL, nP)
    let bestTotal = Infinity
    let bestAssign: number[] = []  // li → pi mapping (length n)
    let bestLineOrder: number[] = [] // which nL-indices were chosen (length n)

    // DFS over permutations of paradas assigned to a chosen subset of lines.
    // lineOrder: the nL-indices actually assigned; cur: their parada assignments.
    const dfsAssign = (step: number, usedP: Set<number>, cur: number[], lineOrder: number[]) => {
      if (step === n) {
        const total = cur.reduce((sum, pi, k) => sum + mat[lineOrder[k]][pi], 0)
        if (total < bestTotal) { bestTotal = total; bestAssign = [...cur]; bestLineOrder = [...lineOrder] }
        return
      }
      for (let pi = 0; pi < nP; pi++) {
        if (!usedP.has(pi)) {
          usedP.add(pi); cur.push(pi)
          dfsAssign(step + 1, usedP, cur, lineOrder)
          cur.pop(); usedP.delete(pi)
        }
      }
    }

    if (nL <= nP) {
      // All lines get a parada: use all nL indices in order.
      const lineOrder = Array.from({ length: nL }, (_, i) => i)
      dfsAssign(0, new Set(), [], lineOrder)
    } else {
      // More lines than paradas: enumerate all C(nL, n) subsets of lines.
      // nL <= 5 and n = nP <= 5, so at most C(5,2)*2! = 20 iterations worst case.
      const chooseLines = (start: number, chosen: number[]) => {
        if (chosen.length === n) {
          dfsAssign(0, new Set(), [], [...chosen])
          return
        }
        for (let li = start; li < nL; li++) {
          chosen.push(li)
          chooseLines(li + 1, chosen)
          chosen.pop()
        }
      }
      chooseLines(0, [])
    }

    for (let k = 0; k < bestAssign.length; k++) {
      const li = bestLineOrder[k]
      const pi = bestAssign[k]
      if (mat[li][pi] < INF) result.set(ls[li].id, ps[pi])
    }
  } else {
    // Hungarian (Jonker-Volgenant) para nL > 5 — O(n³) optimal assignment.
    // Greedy podia errar em ambiguidades (ex: caminhão Princesa fazendo 8
    // entregas onde duas lojas têm nomes parecidos). Hungarian garante
    // minimização global da soma de scores.
    // Mantém scores originais separados do capped: o filter usa original (Infinity = inválido)
    // enquanto hungarianMin recebe capped (Infinity → INF) igual ao path brute-force acima.
    const rawScores = ls.map(l => ps.map(p => scorePair(l, p)))
    const mat = rawScores.map(row => row.map(s => (s === Infinity ? INF : s)))
    const assignment = hungarianMin(mat)
    for (let li = 0; li < nL; li++) {
      const pi = assignment[li]
      if (pi >= 0 && rawScores[li][pi] < Infinity) {
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
      // Pré-computa "redes possíveis" de cada parada via resolveLojaId em todas
      // as redes. Uma parada de PREZUNIC TIJUCA volta com {PREZUNIC} e fica
      // bloqueada pra escalas da ARMAZEM_GRAO. Uma parada SENDAS X - LJ Y que
      // foi convertida em Assaí ganha {SENDAS, ASSAI} e desbloqueia ambas.
      const redesPresentes = [...new Set(lojas.map(l => l.rede_id))]
      const paradaRedes = new Map<string, Set<string>>()
      for (const p of paradasOrdenadas) {
        const redes = new Set<string>()
        for (const r of redesPresentes) {
          if (resolveLojaId(p, lojas, r)) redes.add(r)
        }
        paradaRedes.set(p.id, redes)
      }

      // Fallback temporal AGORA RESTRITO: aceita só pares com tokens em comum.
      // Antes (a)+(b)+(c) — (b)/(c) atribuíam paradas só por rede ou por
      // ausência de rede, gerando matches "rede certa, loja errada" como
      // KUL1425 (escala Pechincha, Unitrac Vila Isabel). Ambos PREZUNIC,
      // mas lojas físicas DIFERENTES. Resultado: KPI mostrava horários da
      // loja errada — pior que UNMATCHED.
      //
      // Agora: scorePair < Infinity OBRIGATÓRIO. Se nenhuma parada tem token
      // em comum com a loja escalada, deixa UNMATCHED — o operador resolve
      // ou aceita "NÃO FOI AO CLIENTE".
      const usadosFallback = new Set<number>()
      for (let i = 0; i < linhasOrdenadas.length; i++) {
        const linha = linhasOrdenadas[i]
        let melhorIdx = -1
        for (let j = 0; j < paradasOrdenadas.length; j++) {
          if (usadosFallback.has(j)) continue
          const parada = paradasOrdenadas[j]
          const redes = paradaRedes.get(parada.id) ?? new Set<string>()
          // Bloqueia se a parada bate claramente com outra rede
          if (redes.size > 0 && !redes.has(linha.rede_id)) continue
          // Critério primário: scorePair finito (tokens compartilhados ou levenshtein <= 2).
          if (scorePair(linha, parada) < Infinity) {
            melhorIdx = j
            break
          }
          // Rede fallback (restrito a 1 linha sem match): cobre formatos "Rota NN"
          // (ex: Guanabara) onde a escala não tem nome geográfico compatível com o
          // Unitrac. Com só 1 slot livre e a parada não identificada como outra rede,
          // não há risco de misturar lojas ("rede certa, loja errada").
          if (linhasOrdenadas.length === 1 && (redes.has(linha.rede_id) || redes.size === 0)) {
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

    // Geo fallback for Category B: FORA_BASE stops near loja coordinates.
    // Usa tanto as lojas operacionais (filtradas pela rede da escala) quanto
    // as canonical_loja como pool de matching geográfico.
    const linhasAindaSemMatch = linhas.filter(l => !matchByEscalaId.has(l.id))
    if (linhasAindaSemMatch.length > 0) {
      const paradasForaBase = todas
        .filter(p =>
          p.classificacao === 'FORA_BASE' &&
          p.lat != null && p.lng != null &&
          !usados.has(p.id)
        )
        .sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())

      const usadosGeo = new Set<number>()
      for (const linha of linhasAindaSemMatch) {
        // Pra cada linha sem match, procura parada FORA_BASE próxima de loja
        // cadastrada da MESMA REDE (operacional ou canonical).
        const lojasDaRede: GeoStore[] = lojas
          .filter(l => l.rede_id === linha.rede_id && l.lat != null && l.lng != null)
          .map(l => ({ id: l.id, name: l.nome, lat: l.lat as number, lng: l.lng as number, raio_metros: l.raio_metros }))
        // Canonical_loja não tem rede_id no GeoStore — entra como pool geral
        // mas só será usado se nenhuma loja operacional da rede bater.
        let melhorIdx = -1
        for (let j = 0; j < paradasForaBase.length; j++) {
          if (usadosGeo.has(j)) continue
          const p = paradasForaBase[j]
          const bateRedeEspecifica = resolveForaBaseGeo(p.lat!, p.lng!, lojasDaRede) !== null
          const bateCanonical = !bateRedeEspecifica && (geoStores ?? []).length > 0
            && resolveForaBaseGeo(p.lat!, p.lng!, geoStores!) !== null
          if (bateRedeEspecifica || bateCanonical) {
            melhorIdx = j
            break
          }
        }
        if (melhorIdx >= 0) {
          matchByEscalaId.set(linha.id, paradasForaBase[melhorIdx])
          usados.add(paradasForaBase[melhorIdx].id)
          usadosGeo.add(melhorIdx)
          geoMatchedLineIds.add(linha.id)
        }
      }
    }

    // Fallback "parada compartilhada": pra placas onde MÚLTIPLAS lojas escala
    // compartilham UMA parada agregada do Unitrac (caso típico Armazém Grão:
    // 4 Reginas escala + 1 codigo_loja consolidado). Se ao menos UMA linha
    // dessa placa casou, atribui a MESMA parada (reuso, sem usar 'usados') a
    // todas as linhas restantes que pertencem à mesma rede da parada.
    const linhasRestantes = linhas.filter(l => !matchByEscalaId.has(l.id))
    if (linhasRestantes.length > 0) {
      // Paradas LOJA já atribuídas a alguma linha dessa placa (qualquer rede)
      const paradasUsadasNaPlaca: UnitracParadaRow[] = []
      for (const l of linhas) {
        const m = matchByEscalaId.get(l.id)
        if (m && m.classificacao === 'LOJA') paradasUsadasNaPlaca.push(m)
      }
      for (const linha of linhasRestantes) {
        // Procura parada compartilhável: bate com rede da escala via cadastro OU via tokens.
        // Token fallback cobre redes cross-docking (ARMAZEM_GRAO) onde as lojas estão
        // cadastradas com rede_id diferente (ASSAI, PREZUNIC…) e o filtro por rede_id falharia.
        const compartilhada = paradasUsadasNaPlaca.find(p => {
          if (!p.codigo_loja && !p.nome_loja) return false
          const lojasDaRede = lojas.filter(l => l.rede_id === linha.rede_id)
          if (p.codigo_loja && lojasDaRede.some(l => l.codigo_unitrac === p.codigo_loja)) return true
          if (p.nome_loja) {
            const np = p.nome_loja.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            if (lojasDaRede.some(l => l.nome_unitrac?.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === np)) return true
          }
          // Token fallback: parada não está no catálogo da rede mas tem tokens em comum
          if (scorePair(linha, p) < Infinity) return true
          return false
        })
        if (compartilhada) {
          matchByEscalaId.set(linha.id, compartilhada)
          // NÃO marca em usados — outras linhas podem compartilhar também
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
    // ATENÇÃO: existe uma segunda implementação em unitrac.ts:computeSaidaCd (parser).
    // Aquela versão grava no DB mas é ignorada aqui — esta recomputa do zero.
    // Qualquer mudança de semântica deve ser replicada nas duas.
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
      // LOJA ou FORA_BASE só contam como "primeira parada operacional" DEPOIS de
      // ter passado pela BASE. Antes, LOJA-cedo-demais (caminhão fez entrega
      // madrugada antes de voltar à base) abortava o loop e saida_cd virava null.
      if (!viuBase) continue
      if (p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE') {
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

    // Fallback: veículo tem GPS mas nunca passou pela BASE BENASSI.
    // Usa chegada na 1ª parada operacional como proxy de saída CD.
    // (mesmo comportamento de computeSaidaCd em unitrac.ts linha 176)
    if (!saida_cd && todasParadas.length > 0) {
      const firstOp = todasParadas.find(
        p => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE'
      )
      if (firstOp) saida_cd = new Date(firstOp.chegada)
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

    // Confidence e requiresReview derivados do score real, não do algoritmo.
    // Antes: isGeo ? 'LOW' : 'HIGH' — trgm com score 0.62 recebia HIGH indevidamente.
    // Agora: HIGH se score >= 0.85, LOW se >= 0.6, UNMATCHED se < 0.6 (mas com parada).
    const metaConfidence: MatchConfidence = isGeo || metaScore < 0.85
      ? (metaScore >= 0.6 ? 'LOW' : 'UNMATCHED')
      : 'HIGH'
    const metaRequiresReview = metaScore < 0.75

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
        ? { score: metaScore, confidence: metaConfidence, requiresReview: metaRequiresReview, algorithm: metaAlgorithm }
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
