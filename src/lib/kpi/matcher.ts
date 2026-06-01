import { levenshtein, normalizaNome } from '@/lib/utils/texto'
import { haversine } from '@/lib/utils/geo'
import type { RotaKpi, ParadaKpi } from '@/lib/types/kpi'
import { normalizeForScore } from '@/lib/utils/score'
import type { MatchMeta, MatchAlgorithm, MatchConfidence } from '@/lib/types/kpi'
import { batchTrgmLookup, type TrgmResult } from './trgm-lookup'
import { hungarianMin } from '@/lib/utils/hungarian'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isRotaGigante } from './rotas-gigantes'
import { isVeiculoInativo } from './veiculos-inativos'
import { matchGeoEndereco } from '@/lib/lojas/match-geo-endereco'

// Tokeniza nome de loja pra match fuzzy: remove acentos, parênteses (1ª Entrega), redes,
// stopwords (DO, DE, DA, SAO), retorna set de tokens significativos.
const REDES_TOKEN = new Set([
  'PRINCESA','PREZUNIC','ASSAI','ASSAÍ','CARREFOUR','SUPERPRIX','SUPER','PRIX','PAX',
  'SENDAS','GUANABARA','MUNDIAL','VIANENSE','EMANUEL','SAMS','ATACADAO','FEIRA','NOVA',
  'CAB','ARMAZEM','GRAO','ZONA','SUL','MERCADO','SUPERMERCADO',
  // PETROPOLIS removido: é nome de cidade (Petrópolis RJ), não de rede — filtrar impede
  // que "CAB PETROPOLIS" bata com "7012010 - CAB - PETROPOLIS" via token "PETROPOLIS".
  // GB: abreviação compartilhada por TODAS as lojas Guanabara ("GB 07 - BARRA", "GB 18 - CAXIAS"…)
  // — se não filtrar, scorePair entre lojas distintas ainda acumula overlap via 'GB' e
  //   produz score finito, causando false matches no T18.
  'GB',
])
// IMPORTANTE: "SAO/SÃO" foi removida das stopwords. Filtrava "São Gonçalo"
// virando só {GONCALO} e batia falso-positivo com qualquer outra rota "GONCALO".
// "Sao Joao de Meriti" idem. Bairros RJ usam "SAO X" extensivamente.
const STOPWORDS = new Set(['DO','DE','DA','DOS','DAS','LOJA','REDE'])

// Redes que compartilham infraestrutura/identidade (mesmo grupo GPA).
// Match cross-rede entre essas é aceito sem penalty — lojas Sendas que
// viraram Assaí no rebrand 2024 mantêm `codigo_unitrac` antigo prefixo `5600`
// mas a escala já usa "ASSAI". Tratar como conjunto fungível.
const REDE_ALIASES: Record<string, string[]> = {
  ASSAI: ['SENDAS'],
  SENDAS: ['ASSAI'],
  SUPER_PAX: ['PAX'],
  PAX: ['SUPER_PAX'],
}

function redesFungiveis(rede: string): Set<string> {
  return new Set([rede, ...(REDE_ALIASES[rede] ?? [])])
}

// Faixa geográfica das BASES (Av Brasil, CEASA-RJ). São DUAS bases coladas (~320m),
// confirmadas pela cliente em 2026-06-01:
//   - Av Brasil, Coelho Neto, CEP 21530-900   → ~(-22.8288, -43.3420)
//   - Av Brasil 19.001, Irajá, CEP 21230-000  → ~(-22.8280, -43.3383)
// O ponto central abaixo + raio 1500m cobre as duas. Cliente Unitrac às vezes
// cadastra geofences de loja cobrindo essa área (ex: cod 13156084 MATRIZ CD DUQUE,
// 7012010 CAB PETROPOLIS, 25414000 NATURCON, 23080000 SANTO AGOSTINHO). Quando o
// GPS cai aqui, é BASE — ignora o cod_loja sobreposto E conta como saída do CD,
// mesmo que o texto do Unitrac não diga "BASE BENASSI" (a 2ª base não diz).
const BASE_BENASSI_LAT = -22.828
const BASE_BENASSI_LNG = -43.339
const BASE_BENASSI_RAIO_METROS = 1500

// Centros das 2 bases reais (confirmados 2026-06-01). Raio de 1000m definido PELA
// CLIENTE (cobre o pátio das duas bases). Mais apertado que o BASE_BENASSI_RAIO_METROS
// (1500m, usado p/ ignorar geofence sobreposto) pra saída CD não confundir loja
// perto do CEASA com base.
const BASES_CD: ReadonlyArray<{ lat: number; lng: number }> = [
  { lat: -22.8288, lng: -43.3420 }, // Av Brasil, Coelho Neto, CEP 21530-900
  { lat: -22.8280, lng: -43.3383 }, // Av Brasil 19.001, Irajá, CEP 21230-000
]
const BASE_CD_RAIO_METROS = 1000

/** Parada fisicamente numa das 2 bases (para detectar saída do CD por coordenada). */
function paradaEhBaseCd(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false
  return BASES_CD.some(b => haversine(lat, lng, b.lat, b.lng) <= BASE_CD_RAIO_METROS)
}

function paradaEhRegiaoBase(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false
  return haversine(lat, lng, BASE_BENASSI_LAT, BASE_BENASSI_LNG) <= BASE_BENASSI_RAIO_METROS
}

// MODO SEM GEOFENCE (beta): quando true, desliga todos os matches por proximidade
// GPS — mantém só código/nome/placa. Lojas com cadastro Unitrac bugado (geofence
// sobreposto) deixam de casar e ficam vazias na planilha. (regra Tia Erica/William)
//
// INVARIANTE DE PRODUÇÃO: SEM_GEO é um global de módulo compartilhado entre requests
// concorrentes na mesma instância serverless. Em produção é SEMPRE setado `true`
// (kpi/preview e kpi/simples) e NUNCA resetado para `false` — só os testes alternam,
// sempre com try/finally restaurando o default. Se algum dia uma rota precisar de
// geo, NÃO faça setSemGeo(false) num fluxo concorrente: o certo é passar o modo
// explícito por chamada (AsyncLocalStorage ou parâmetro de cruzaEscalaUnitrac).
// Resetar o global entre o set e o await corromperia o KPI de requests paralelos.
let SEM_GEO = false
export function setSemGeo(v: boolean): void { SEM_GEO = v }

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
    // Remove só parênteses com marcador de entrega — "(1ª Entrega)", "(1° Entrega)", "(1º Entrega)",
    // "(2° Entrega)", "(Entrega Extra)". Aceita ª, º, °, A, O (escala digita inconsistente).
    // ANTES: `\([^)]*\)` apagava TUDO entre parênteses, incluindo discriminadores de loja
    // ("ARMAZÉM DO GRÃO (ITAIPAVA)" virava "ARMAZÉM DO GRÃO" → token vazio).
    .replace(/\(\s*\d+\s*[ªº°AO]?\s*ENTREGAS?\s*\)/gi, ' ')
    .replace(/\(\s*ENTREGAS?\s+EXTRA\s*\)/gi, ' ')
    // Pra demais parênteses, manter o conteúdo (é discriminador) — só remove os símbolos
    .replace(/[()]/g, ' ')
    // Mesmo padrão FORA de parênteses ("Vianense - Recreio 1º entrega")
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
    if (!temComum) {
      // Números divergem — pode ser numeração diferente (ex: Assaí novo vs Sendas antigo:
      // "Barra I Loja 133" na escala vs "SENDAS BARRA I - LJ 32" no Unitrac).
      // Verifica se os tokens não-numéricos têm sobreposição suficiente e aceita com penalidade.
      const tlCore = new Set([...tl].filter(t => !/^\d+$/.test(t)))
      const tpCore = new Set([...tp].filter(t => !/^\d+$/.test(t)))
      if (tlCore.size === 0 || tpCore.size === 0) return Infinity
      let coreCommon = 0
      for (const t of tlCore) if (tpCore.has(t)) coreCommon++
      if (coreCommon === 0) return Infinity
      // Penalidade +3 pra desincentivar vs match com número exato.
      return Math.max(tlCore.size, tpCore.size) - coreCommon + 3
    }
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
  sub_rede?: string | null
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
  endereco?: string | null
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
  endereco?: string | null
  bairro?: string | null
  municipio?: string | null
  numero?: string | null
}

/**
 * Consolida paradas LOJA consecutivas no MESMO cliente em UMA só parada.
 *
 * Cenário (confirmado pela Tia Érica nos vídeos): quando o caminhão entrega
 * num cliente, ele pode "pular pra rua lateral" e voltar, gerando 2-3
 * registros consecutivos com o mesmo Local da Parada no Unitrac. A
 * interpretação correta é UMA parada: chegada = primeira, saída = última.
 *
 * Reconhece "mesmo cliente" por (em ordem de preferência):
 *  1. codigo_loja igual nas duas paradas (caso ideal)
 *  2. nome_loja normalizado igual (Unitrac retorna nome mesmo sem código)
 *  3. local_parada raw normalizado igual (fallback final)
 *
 * Antes só consolidava por código — caso típico ZONA_SUL (que usa só número
 * de filial, sem nome) ou Unitrac que retorna paradas com codigo_loja null
 * mas nome igual ficavam SEM consolidação, gerando KPI fragmentado.
 */
function nomeLojaNorm(s: string | null | undefined): string {
  if (!s) return ''
  return s.toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function consolidarParadasMesmoCliente(paradas: UnitracParadaRow[]): UnitracParadaRow[] {
  const out: UnitracParadaRow[] = []
  for (const p of paradas) {
    const last = out[out.length - 1]

    // GAP_CONSOLIDACAO_MAX: 30min entre saída de uma parada e chegada da próxima.
    // Acima disso, mesmo sendo "mesma loja", são entregas SEPARADAS (não consolidar).
    // Caso REGINA Armazém Grão dia 19: caminhão TML6D96 faz 14 paradas em REGINA
    // BARRA DO IMBUY entre 00:03 e 23:56 — cada uma uma entrega diferente.
    // Sem esse limite, consolidação juntava tudo em 1 parada de 24h.
    // 30min cobre o caso "rua lateral" do vídeo Tia Érica (gap ~7min) sem juntar
    // entregas distintas separadas por mais tempo.
    const GAP_CONSOLIDACAO_MAX_SEG = 30 * 60

    let mesmaLoja = false
    if (last && last.classificacao === 'LOJA' && p.classificacao === 'LOJA') {
      // Checa gap temporal primeiro — sem gap aceitável, nem tenta consolidar
      const lastSaida = last.saida ? new Date(last.saida).getTime() : new Date(last.chegada).getTime()
      const pChegada = new Date(p.chegada).getTime()
      const gapSeg = (pChegada - lastSaida) / 1000

      if (gapSeg < GAP_CONSOLIDACAO_MAX_SEG) {
        // 1. Mesmo código (caso ideal). Mas verificar geo: se coords das duas paradas
        // estão muito distantes (>500m), são lojas DIFERENTES com mesmo geofence
        // sobreposto no Unitrac. Caso ARMAZEM dia 20: 4 lojas REGINA têm geofence
        // unificado cod 5353012, paradas reais distam 2-3km entre si.
        if (last.codigo_loja && p.codigo_loja && last.codigo_loja === p.codigo_loja) {
          const lastLat = last.lat; const lastLng = last.lng
          const pLat = p.lat; const pLng = p.lng
          if (lastLat != null && lastLng != null && pLat != null && pLng != null) {
            const distEntre = haversine(lastLat, lastLng, pLat, pLng)
            if (distEntre <= 500) mesmaLoja = true
          } else {
            // Bug M1 (matcher audit dia 19): antes consolidava CEGAMENTE quando
            // faltava geo. Caso EZU9J51 ASSAI Loja 131 dia 19: 2 paradas LOJA
            // sem lat/lng com gap 1min consolidavam em 05:05-12:31 (7h26).
            //
            // Fix v2 (revisao code review 27/05): exige AMBAS saidas != null.
            // Se alguma e null (parada em curso, duracao indefinida), NAO
            // consolida sem geo — ambiguidade demais. Antes (fix v1) zerava
            // duracao e durTotalMin caia em gapSeg, sempre <90min: bypass.
            if (last.saida !== null && p.saida !== null) {
              const durLast = (new Date(last.saida).getTime() - new Date(last.chegada).getTime()) / 1000
              const durP = (new Date(p.saida).getTime() - new Date(p.chegada).getTime()) / 1000
              const durTotalMin = (durLast + durP + gapSeg) / 60
              if (durTotalMin <= 90) mesmaLoja = true
            }
          }
        }
        if (!mesmaLoja) {
          // Guard de distância também aqui: se coords disponíveis e ≤500m, OK consolidar
          // por nome/local_parada. Caso ARMAZEM: 4 lojas REGINA têm mesmo local_parada
          // raw "BASE BENASSI, 5353012 REGINA BARRA IMBUY..." mas estão fisicamente
          // separadas por 2-3km cada — não devem consolidar.
          let geoBate = true
          if (last.lat != null && last.lng != null && p.lat != null && p.lng != null) {
            const distEntre = haversine(last.lat, last.lng, p.lat, p.lng)
            geoBate = distEntre <= 500
          }
          if (geoBate) {
            // 2. Mesmo nome_loja normalizado (Unitrac sem código mas com nome)
            const nomeLast = nomeLojaNorm(last.nome_loja)
            const nomeP = nomeLojaNorm(p.nome_loja)
            if (nomeLast && nomeP && nomeLast === nomeP) mesmaLoja = true
            else {
              // 3. Fallback: local_parada raw normalizado
              const localLast = nomeLojaNorm(last.local_parada)
              const localP = nomeLojaNorm(p.local_parada)
              if (localLast && localP && localLast === localP) mesmaLoja = true
            }
          }
        }
      }
    }
    if (mesmaLoja) {
      // Antes: exigia ambos saida e chegada não-null. Quando p.saida era null
      // (caminhão ainda parado, última parada do dia), caía no else e empurrava
      // parada repetida — depois `deduplicarPorCodigo` descartava uma e podia
      // sumir a que tinha chegada válida. Agora consolida sempre que mesmaLoja.
      // Preserva o id da parada com maior duração original — garante que o
      // check-in curto (7min) não "sobrescreva" a entrega real (90min) no id.
      // Importante para rastreabilidade: o id resultante identifica a parada
      // dominante do par, não necessariamente a primeira cronologicamente.
      const durLastOrig = last.saida === null ? Infinity : (last.duracao_seg ?? 0)
      const durPOrig = p.saida === null ? Infinity : (p.duracao_seg ?? 0)
      if (durPOrig > durLastOrig) last.id = p.id
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
 * Estende saída da entrega seguindo cadeia adjacente de paradas FORA_BASE.
 *
 * Aplica-se em DOIS padrões:
 *
 *  A) **matched=LOJA curta + FORA_BASE longo na mesma área** (caso original).
 *     PREZUNIC FONSECA dia 20 (placa KQV1D80):
 *       05:27→05:31 LOJA  dur=4min   dist=12m
 *       05:33→09:28 FORA_BASE dur=236min dist=149m
 *     Manual: SL=09:30. Sistema antigo: 05:31 (Δ239min).
 *
 *  B) **matched=FORA_BASE/FAKE_EXIT (loja sem geofence LOJA)** + cadeia
 *     adjacente FORA_BASE perto da loja. Bug 6 dia 19:
 *       ATACADAO MANILHA (QSS1E48): FORA_BASE 25→23→106→129min, gaps 1-2min
 *         → SL real = 10:17 (último FB da cadeia)
 *       GUANABARA BENTO RIBEIRO (LBB5205): FAKE_EXIT 3min + FORA_BASE 19min
 *         (gap 2min) + FORA_BASE 95min (gap 16min) → SL real = 12:48
 *       CARREFOUR SULACAP, GUANABARA BONSUCESSO: padrão idêntico
 *     Sem extensão, sistema usa saída do PRIMEIRO FORA_BASE matched (cedo demais).
 *
 * Critérios:
 *   - matched.classificacao ∈ {LOJA (dur≤15min), FORA_BASE, FAKE_EXIT}
 *   - matched.lat/lng disponíveis (georreferenciada)
 *   - próxima parada deve ser FORA_BASE (FAKE_EXIT NÃO conta como step da cadeia
 *     pra evitar regressões; apenas como ponto de matched)
 *   - gap base ≤10min com FORA_BASE dur ≥15min, OU gap ≤20min com FORA_BASE
 *     dur ≥30min (cadeia "promissora" tolera gap maior, ex: BENTO RIBEIRO 16min)
 *   - cada FORA_BASE adjacente ≤300m do matched original
 *   - segue cadeia (multi-step) acumulando o último saida válido
 *
 * Não aplica:
 *   - LOJA longa (≥15min) seguida de outras LOJAs (Recreio: entregas legítimas)
 *   - FORA_BASE >300m do matched (Vilar dos Teles: FORA_BASE a 660m)
 *   - sem FORA_BASE seguinte (Loja 43/45 ZS: fim-de-rota — não fixável aqui)
 */
function estendeSaidaPorForaBase(
  matched: UnitracParadaRow,
  todasParadas: UnitracParadaRow[],
): Date | null {
  if (!matched.saida) return null
  const matchedSaidaTs = new Date(matched.saida).getTime()
  const matchedDurSeg = matched.duracao_seg ?? 0
  const cls = matched.classificacao
  // LOJA: só estende se for curta (≤15min). FORA_BASE/FAKE_EXIT: estende sem
  // restrição de duração (matched pode ser longo, ex: MANILHA 106min).
  if (cls === 'LOJA') {
    if (matchedDurSeg > 15 * 60) return null
  } else if (cls !== 'FORA_BASE' && cls !== 'FAKE_EXIT') {
    return null
  }
  if (matched.lat == null || matched.lng == null) return null

  let saidaEstendida: Date | null = null
  let prevSaidaTs = matchedSaidaTs
  for (const p of todasParadas) {
    const pChegada = new Date(p.chegada).getTime()
    if (pChegada <= prevSaidaTs - 1) continue
    if (pChegada < prevSaidaTs) continue
    // Só FORA_BASE como step da cadeia. FAKE_EXIT pode ser matched mas não
    // é step (pra não pular base-bounce indevidamente).
    if (p.classificacao !== 'FORA_BASE') break
    if (!p.saida) break
    if (p.lat == null || p.lng == null) break

    const gapSeg = (pChegada - prevSaidaTs) / 1000
    const pDurSeg = p.duracao_seg ?? 0
    // Gradiente: gap≤10min permite FORA_BASE ≥15min. gap≤20min só pra FORA_BASE
    // longo (≥30min, cadeia "promissora").
    const aceitaPorGapCurto = gapSeg <= 10 * 60 && pDurSeg >= 15 * 60
    const aceitaPorGapMedio = gapSeg <= 20 * 60 && pDurSeg >= 30 * 60
    if (!aceitaPorGapCurto && !aceitaPorGapMedio) break

    // Dist sempre do matched original (não acumula deriva entre FORA_BASE).
    const dist = haversine(matched.lat, matched.lng, p.lat, p.lng)
    if (dist > 300) break

    saidaEstendida = new Date(p.saida)
    prevSaidaTs = new Date(p.saida).getTime()
    // Continua iterando — multi-step. Acumula a última saída.
  }
  return saidaEstendida
}

/**
 * T16: Saída CD per-parada (multi-trip). Para uma parada operacional alvo,
 * retorna a ÚLTIMA saída de BASE BENASSI estritamente ANTES da chegada do alvo.
 * Sem isso, placas com 2+ turnos no dia ficavam todas com a mesma saida_cd
 * (do Trip 1), zerando lojas do Trip 2.
 *
 * Predicado canônico de BASE: classificacao === 'BASE' OU FAKE_EXIT em
 * local_parada começando com 'BASE BENASSI' (GPS bounce na base) OU qualquer
 * parada cujo local_parada contenha 'BASE BENASSI' — cobre o bug do parser
 * onde overlaps geofence BASE+LOJA são classificados como LOJA (o Unitrac
 * concatena todas as geofences sobrepostas com vírgula, e findLojaGeofence
 * prioriza LOJA mesmo quando BASE BENASSI está no prefixo).
 *
 * Sem BASE anterior: retorna null. Melhor que usar FORA_BASE/FAKE_EXIT como
 * proxy (T16-B foi removido) — null no Excel é mais honesto do que timestamp
 * de uma parada não-BASE que pode estar em qualquer lugar.
 */
function computeSaidaCdParaParada(
  paradaAlvo: UnitracParadaRow,
  todasParadas: UnitracParadaRow[],
  ctx?: { redeId?: string; data?: string },
): Date | null {
  const alvoTs = new Date(paradaAlvo.chegada).getTime()
  // REGRA UNIVERSAL (confirmada pela Tia Érica no vídeo 11/05/2026):
  // Saída do CD = SAÍDA DA ÚLTIMA BASE BENASSI antes da primeira LOJA.
  // Exemplo do vídeo: AKZ-2745 saiu 5:03 (deu volta no portão), voltou,
  // saiu 5:30, voltou, saiu 5:59 → SC = 5:59 (última antes da loja).
  // Antes havia um hack para ZONA_SUL <= 18/05 que usava a PRIMEIRA — removido.
  let lastBaseSaida: Date | null = null
  for (const p of todasParadas) {
    if (new Date(p.chegada).getTime() >= alvoTs) break
    // Base detection robusta: classificacao===BASE/FAKE_EXIT em BASE BENASSI,
    // ou qualquer parada cujo local_parada contenha 'BASE BENASSI' (cobre
    // overlaps geofence onde parser classifica erroneamente como LOJA).
    const localStr = p.local_parada ?? ''
    const isBase =
      p.classificacao === 'BASE' ||
      (p.classificacao === 'FAKE_EXIT' && localStr.startsWith('BASE BENASSI')) ||
      localStr.includes('BASE BENASSI') ||
      // 2ª base (Irajá/Coelho Neto) não escreve "BASE BENASSI" no Unitrac — detecta
      // por coordenada (raio apertado 600m). Resolve saída CD de quem sai dela (ex:
      // caminhão que aparece FORA_BASE na base de madrugada antes da 1ª entrega).
      paradaEhBaseCd(p.lat, p.lng)
    if (isBase && p.saida) {
      const s = new Date(p.saida)
      if (s.getTime() < alvoTs) {
        if (!lastBaseSaida || s.getTime() > lastBaseSaida.getTime()) {
          lastBaseSaida = s
        }
      }
    }
  }
  // Sem BASE exit = não sabemos quando saiu do CD → null (melhor que FAKE_EXIT/FORA_BASE como proxy)
  return lastBaseSaida
}

/**
 * Quando o caminhão passa brevemente pela loja antes da entrega real (ex: motorista
 * verifica se a loja está aberta, gera parada de 5-9 min com o mesmo codigo_loja),
 * o Unitrac gera duas paradas LOJA com mesmo código. Fica com a de MAIOR duração
 * (a entrega real), que é a que Tia Érica anota no KPI manual.
 *
 * Exceção: parada que começa antes das 03:00 BRT com duração > 4h é estacionamento
 * noturno (veículo dormiu perto da loja). Nesse caso, preferir qualquer outra parada
 * no mesmo código que começou depois das 03:00, mesmo que seja mais curta.
 */
function deduplicarPorCodigo(paradas: UnitracParadaRow[]): UnitracParadaRow[] {
  // ExcelJS parseia serials do xlsx como UTC → BRT fica armazenado no campo UTC.
  // getUTCHours() devolve a hora BRT diretamente (sem ajuste de fuso).
  const NOITE_H = 3  // 03:00 BRT (chegada antes disso = noturna)
  const SAIDA_MANHA_H = 6  // 06:00 BRT (saída até aqui = ainda madrugada)
  const NOITE_DUR_SEG = 2 * 3600 // 2 horas — cobre paradas de 93-94min às 01-02h BRT
  // Estacionamento noturno = motorista dormiu perto da loja. Critério:
  //   chegada de madrugada (< 03:00) E saída AINDA de madrugada (< 06:00) E duração > 2h.
  // Critério antigo (só chegada+duração) marcava como noturno operações que começavam
  // 00:00 mas iam até 13:14 — operação real, não estacionamento.
  function isEstacionamentoNoturno(p: UnitracParadaRow): boolean {
    const h = new Date(p.chegada).getUTCHours()
    if (h >= NOITE_H) return false
    const dur = p.saida === null ? Infinity : (p.duracao_seg ?? 0)
    if (dur <= NOITE_DUR_SEG) return false
    // Parada ainda aberta (saida=null) com chegada noturna: trata como estacionamento (não saiu)
    if (!p.saida) return true
    const hSaida = new Date(p.saida).getUTCHours()
    return hSaida < SAIDA_MANHA_H
  }

  // Agrupa paradas por código de loja (em ordem cronológica)
  const ordenadas = [...paradas].sort(
    (a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime(),
  )
  const semCodigo: UnitracParadaRow[] = []
  const grupos = new Map<string, UnitracParadaRow[]>()
  for (const p of ordenadas) {
    if (!p.codigo_loja) { semCodigo.push(p); continue }
    const arr = grupos.get(p.codigo_loja) ?? []
    arr.push(p)
    grupos.set(p.codigo_loja, arr)
  }

  // GAP_VISITA_SEPARADA: 60min entre saída de uma parada e chegada da próxima
  // (mesmo código) → consideradas visitas SEPARADAS (motorista voltou de novo).
  // Caso típico PRINCESA dia 19: Arraial 1 às 05:56-06:30 + 11:15-12:15 (5h gap)
  // = duas entregas reais (manhã e tarde), ambas devem aparecer no KPI.
  // Antes: dedup pegava só a de maior duração (12:15 60min > 06:30 34min),
  // sumindo a entrega da manhã que era a "1ª Entrega" da escala.
  const GAP_VISITA_SEPARADA_SEG = 60 * 60

  const mantidas: UnitracParadaRow[] = []
  for (const arr of grupos.values()) {
    if (arr.length === 1) { mantidas.push(arr[0]); continue }
    // Separar em "clusters" por gap > GAP_VISITA_SEPARADA_SEG entre saída→chegada
    const clusters: UnitracParadaRow[][] = [[arr[0]]]
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1]
      const cur = arr[i]
      const prevSaida = prev.saida ? new Date(prev.saida).getTime() : new Date(prev.chegada).getTime()
      const curChegada = new Date(cur.chegada).getTime()
      const gap = (curChegada - prevSaida) / 1000
      if (gap >= GAP_VISITA_SEPARADA_SEG) clusters.push([cur])
      else clusters[clusters.length - 1].push(cur)
    }
    // Para cada cluster, manter a parada "principal" (não-noturna, maior duração).
    // Clusters separados = visitas distintas, todas mantidas.
    for (const cluster of clusters) {
      let melhor: UnitracParadaRow | null = null
      for (const p of cluster) {
        if (!melhor) { melhor = p; continue }
        const pNoite = isEstacionamentoNoturno(p)
        const exNoite = isEstacionamentoNoturno(melhor)
        if (exNoite && !pNoite) melhor = p
        else if (!exNoite && pNoite) { /* mantém */ }
        else {
          const dP = p.saida === null ? Infinity : (p.duracao_seg ?? 0)
          const dE = melhor.saida === null ? Infinity : (melhor.duracao_seg ?? 0)
          if (dP > dE) melhor = p
        }
      }
      if (melhor) mantidas.push(melhor)
    }
  }

  return [...mantidas, ...semCodigo].sort(
    (a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime(),
  )
}

/**
 * Remove paradas que, após deduplicação, ficaram como única opção para um código
 * de loja e são estacionamento noturno (veículo dormiu perto da loja).
 * Prefere SEM GPS a mostrar 00:01 ou 01:07 como horário de chegada.
 */
function filtrarParadaNocturnaSolitaria(paradas: UnitracParadaRow[]): UnitracParadaRow[] {
  const NOITE_H = 3  // 03:00 BRT (chegada antes disso = noturna)
  const SAIDA_MANHA_H = 6 // 06:00 BRT (saída antes disso = ainda madrugada)
  const NOITE_DUR_SEG = 3 * 3600 // 3h — captura veículos que dormem perto da loja (ex: KOP-4978 às 00:03 BRT com 3h51); entregas reais de madrugada raramente ficam >3h parados
  // Mesma lógica de deduplicarPorCodigo: estacionamento noturno legítimo exige
  // chegada de madrugada E saída ainda de madrugada. Saída no meio do dia = operação real.
  function isEstNocturno(p: UnitracParadaRow): boolean {
    const h = new Date(p.chegada).getUTCHours()
    if (h >= NOITE_H) return false
    const dur = p.saida === null ? Infinity : (p.duracao_seg ?? 0)
    if (dur <= NOITE_DUR_SEG) return false
    if (!p.saida) return true
    const hSaida = new Date(p.saida).getUTCHours()
    return hSaida < SAIDA_MANHA_H
  }
  // Conta paradas por codigo_loja
  const contagem = new Map<string, number>()
  for (const p of paradas) {
    if (!p.codigo_loja) continue
    contagem.set(p.codigo_loja, (contagem.get(p.codigo_loja) ?? 0) + 1)
  }
  // Exclui parada noturna solitária (única com esse codigo_loja)
  return paradas.filter((p) => {
    if (!p.codigo_loja) return true
    if ((contagem.get(p.codigo_loja) ?? 0) > 1) return true
    return !isEstNocturno(p)
  })
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

  // Priority 4: geo proximity (DESLIGADO no modo SEM_GEO)
  if (!SEM_GEO && parada.lat != null && parada.lng != null) {
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

// Pares de chars que o parser PDF do Unitrac confunde por causa do tipo Mercosul.
// Cada char mapeia para TODAS as alternativas possíveis (suporta múltiplas).
const OCR_PARES: Record<string, string[]> = {
  '1': ['B', 'I'],
  'B': ['1'],
  '4': ['E'],
  'E': ['4'],
  '6': ['G'],
  'G': ['6'],
  '7': ['H'],
  'H': ['7'],
  '8': ['I'],
  'I': ['8', '1'],
  '9': ['J'],
  'J': ['9'],
}

// Gera variantes da placa com ate 1 substituicao OCR (1 char diferente).
//
// Bug N7 (auditoria 2026-05-27): antes limitava a posicao 4 (Mercosul).
// Agora varre TODAS as 7 posicoes. Uma substituicao por placa gerada
// (sem combinatoria). Pos 0-2: letras, pos 3/5/6: numeros, pos 4: ambos.
// Set dedup variantes equivalentes. Tipico: 1-3 variantes/placa.
export function variantesOcr(placa: string): string[] {
  if (placa.length !== 7) return [placa]
  const variantes = new Set<string>([placa])
  for (let i = 0; i < 7; i++) {
    const ch = placa[i]
    const subs = OCR_PARES[ch]
    if (!subs) continue
    for (const sub of subs) {
      variantes.add(placa.slice(0, i) + sub + placa.slice(i + 1))
    }
  }
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
  // V2.1 Reforço 5: rotas gigantes (raio ≥ 5km) NÃO podem casar via código exato
  // a menos que a escala explicitamente cite o código da rota. Caso contrário,
  // múltiplas lojas reais ficariam casadas pela mesma rota.
  const lineCitaRota = line.loja_codigo_raw ? isRotaGigante(line.loja_codigo_raw) : false
  if (line.loja_codigo_raw && p.codigo_loja) {
    const paradaEhRota = isRotaGigante(p.codigo_loja)
    if (!paradaEhRota || lineCitaRota) {
      if (codCasa(line.loja_codigo_raw, p.codigo_loja)) s = 0
    }
  }
  // Tenta geofences adicionais (Unitrac concatena múltiplas separadas por vírgula).
  // O parser só salva codigo_loja/nome_loja da PRIMEIRA geofence LOJA; quando a
  // relevante é a 2ª/3ª, sem isso o pair recebe Infinity e perde o match.
  // Exemplo: Escala ALHAMBRA (21469000) vs Unitrac "17659001 - O BOM CAMPO
  // GRANDE,21469000 - EMANUEL ALHAMBRA".
  if (s > 0 && p.local_parada) {
    const partes = p.local_parada.split(',').map(t => t.trim()).filter(Boolean)
    for (const parte of partes) {
      const m = parte.match(/^(\d{4,})\s*-\s*(.+)/)
      if (m) {
        // Parte com prefixo "XXXX - NOME"
        const codP2 = m[1]
        const nomePart = m[2].trim()
        // V2.1 Reforço 5: rota gigante só casa via código exato quando a linha
        // explicitamente cita o código da rota. Sem isso, multiplas lojas reais
        // casariam pela mesma rota → GPS clonado. O match por nome continua livre.
        const codBloqueado = isRotaGigante(codP2) && !lineCitaRota
        if (!codBloqueado && line.loja_codigo_raw && codCasa(line.loja_codigo_raw, codP2)) {
          s = 0
          break
        }
        const nomeScore = matchScore(line.loja_nome_raw, nomePart)
        if (nomeScore < s) s = nomeScore
      } else {
        // T13: Parte sem prefixo numérico (ex: "REGINA 1 DE MAIO" quando Unitrac
        // concatena duas paradas REGINA na mesma linha) — match direto por nome.
        const nomeScore = matchScore(line.loja_nome_raw, parte)
        if (nomeScore < s) s = nomeScore
      }
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
  paradaRedes?: Map<string, Set<string>>,
  lojas?: LojaRow[],
): Map<string, UnitracParadaRow> {
  const result = new Map<string, UnitracParadaRow>()
  if (!linhas.length || !paradas.length) return result

  // Desempate determinístico: além do nome, carro_ordem e id. Sem isso, duas linhas
  // da MESMA loja (carro1/carro2) dependiam da ordem de chegada do array vinda do
  // banco (não-determinística sem ORDER BY) → paradas podiam sair trocadas entre os
  // carros entre execuções/ambientes. Com carro_ordem, carro1 fica antes do carro2
  // e, como ps é cronológico e o DFS prefere a 1ª permutação em empate, carro1 casa
  // com a parada mais cedo. id é o desempate final estável.
  const ls = [...linhas].sort((a, b) =>
    a.loja_nome_raw.localeCompare(b.loja_nome_raw)
    || (a.carro_ordem ?? 0) - (b.carro_ordem ?? 0)
    || a.id.localeCompare(b.id))
  const ps = [...paradas].sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
  const nL = ls.length
  const nP = ps.length
  const INF = 1e9

  // T11/T17: score com penalty rede-aware.
  // - Parada na rede certa (ou alias): retorna base sem penalty.
  // - Parada cross-rede E existe parada compatível em ps: Infinity (hard block).
  //   Impede que geofences secundárias sobrepostas (T17) causem match errado.
  // - Parada cross-rede E SEM parada compatível disponível: base + REDE_PENALTY
  //   (queda graciosa T11: VIANENSE com única parada SENDAS ainda é atribuído).
  const REDE_PENALTY = 5
  // Guard cod_loja dono: parada cuja codigo_loja casa exatamente com loja
  // cadastrada A não pode ser atribuída a linha cuja loja cadastrada é B≠A.
  // Caso REGINA dia 19: 14 paradas cod=5353012 (BARRA IMBUY) ficavam distribuídas
  // por Hungarian entre 4 linhas REGINA porque todas compartilham token "REGINA"
  // → scorePair finito → Hungarian aceitava. Agora bloqueia explicitamente.
  const lojaDaLinha = new Map<string, LojaRow | undefined>()
  if (lojas) {
    for (const l of linhas) {
      const fungL = redesFungiveis(l.rede_id)
      const candidatas = lojas.filter(c => {
        if (!fungL.has(c.rede_id)) return false
        if (l.loja_codigo_raw && c.codigo_escala === l.loja_codigo_raw) return true
        if (l.loja_codigo_raw && c.codigo_unitrac === l.loja_codigo_raw) return true
        if (matchScore(l.loja_nome_raw, c.nome) === 0) return true
        if (l.loja_codigo_raw && c.codigo_unitrac && codCasa(l.loja_codigo_raw, c.codigo_unitrac)) return true
        return false
      })
      // Cadastros duplicados (versão escala sem cod_unitrac + versão Unitrac com cod):
      // prefere o com cod_unitrac, que é a fonte de verdade pra match com paradas.
      const dona = candidatas.find(c => c.codigo_unitrac) ?? candidatas[0]
      lojaDaLinha.set(l.id, dona)
    }
  }
  const scoreComRede = (l: EscalaLinhaRow, p: UnitracParadaRow): number => {
    const base = scorePair(l, p)
    if (base === Infinity) return Infinity
    if (lojas && p.codigo_loja) {
      // Parada cod_loja casa com loja cadastrada (em qualquer rede) → dona explícita.
      // Bloqueia atribuição quando:
      //   (a) linha tem lojaCad COM cod_unitrac próprio e dona ≠ lojaCad (REGINA 1 DE MAIO)
      //   (b) linha sem lojaCad E dona é de rede não-fungível com nome ≠ (CAB→FEIRA_NOVA)
      // Permite:
      //   - lojaCad sem cod_unitrac (duplicata da escala) + dona em rede fungível: é a mesma loja
      //   - queda graciosa T11: lojaCad ausente + dona em rede fungível ou nome bate
      const dona = lojas.find(c => c.codigo_unitrac === p.codigo_loja)
      if (dona) {
        const lojaL = lojaDaLinha.get(l.id)
        const fungL2 = redesFungiveis(l.rede_id)
        if (lojaL && dona.id !== lojaL.id) {
          // Duplicata: lojaL é cadastro da escala sem cod (versão "escala-side"),
          // dona é cadastro Unitrac com cod. Se rede fungível, são o mesmo lugar físico.
          if (!lojaL.codigo_unitrac && fungL2.has(dona.rede_id)) {
            // permite — duplicata
          } else {
            return Infinity
          }
        }
        if (!lojaL) {
          const nomeBate = matchScore(l.loja_nome_raw, dona.nome) <= 1
          if (!fungL2.has(dona.rede_id) && !nomeBate) return Infinity
        }
      }
    }
    if (!paradaRedes) return base
    const redes = paradaRedes.get(p.id)
    if (!redes || redes.size === 0) return base
    const fung = redesFungiveis(l.rede_id)
    let casa = false
    for (const r of redes) { if (fung.has(r)) { casa = true; break } }
    if (casa) return base
    // T17: cross-rede. Verifica se existe alguma parada compatível com a rede
    // da linha em ps. Se sim, bloqueia com Infinity — não vale forçar match
    // errado quando a rede certa tem parada disponível.
    const hasCompatible = ps.some(p2 => {
      const r2 = paradaRedes!.get(p2.id)
      if (!r2 || r2.size === 0) return false
      for (const r of r2) { if (fung.has(r)) return true }
      return false
    })
    return hasCompatible ? Infinity : base + REDE_PENALTY
  }

  if (nL <= 5) {
    const mat = ls.map(l => ps.map(p => { const s = scoreComRede(l, p); return s === Infinity ? INF : s }))
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
    const rawScores = ls.map(l => ps.map(p => scoreComRede(l, p)))
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
  opts?: { geoEndereco?: boolean },
): Promise<RotaKpi[]> {
  // V2.1 fix — tradução codigo_escala → codigo_unitrac.
  // Quando uma loja tem codigo_escala='338' e codigo_unitrac='560060', uma linha de
  // escala ASSAI com loja_codigo_raw='338' precisa casar com a parada Unitrac
  // 560060 SENDAS SANTA CRUZ II. Sem essa tradução, codCasa('338','560060') falha.
  // Funciona com redes aliased (ASSAI ↔ SENDAS) via redesFungiveis.
  const escalaTraduzida = escalaLinhas.map(l => {
    if (!l.loja_codigo_raw) return l
    const fung = redesFungiveis(l.rede_id)
    const lojaCad = lojas.find(x => x.codigo_escala === l.loja_codigo_raw && fung.has(x.rede_id) && x.codigo_unitrac)
    if (lojaCad && lojaCad.codigo_unitrac && lojaCad.codigo_unitrac !== l.loja_codigo_raw) {
      return { ...l, loja_codigo_raw: lojaCad.codigo_unitrac }
    }
    return l
  })
  escalaLinhas = escalaTraduzida

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
  // Quando linha é passada, valida que a variante TEM parada batendo a loja escalada:
  //   1) parada LOJA com codigo/nome batendo, OU
  //   2) parada LOJA/FORA_BASE geograficamente dentro do raio da loja escalada
  //      (caso ZS dia 20 LCO0978→LCO0J78: paradas só FORA_BASE mas dentro do raio
  //      das lojas 33/36/01 — antes rejeitava por falta de classificação LOJA).
  function resolvePlacaUnitrac(placaEscala: string, linha?: EscalaLinhaRow): string | null {
    if (paradaByPlaca.has(placaEscala)) return placaEscala
    const variantes = variantesOcr(placaEscala).filter(v => v !== placaEscala)
    const presentes = variantes.filter(v => paradaByPlaca.has(v))
    if (presentes.length !== 1) return null
    const candidata = presentes[0]
    if (linha) {
      const paradas = paradaByPlaca.get(candidata) ?? []
      // Acha loja escalada no cadastro (por código ou nome) pra validar via geo
      const fung = redesFungiveis(linha.rede_id)
      const lojaEscalada = lojas.find(l => {
        if (!fung.has(l.rede_id)) return false
        if (linha.loja_codigo_raw && ((l.codigo_escala && codCasa(linha.loja_codigo_raw, l.codigo_escala)) || (l.codigo_unitrac && codCasa(linha.loja_codigo_raw, l.codigo_unitrac)))) return true
        if (linha.loja_nome_raw && matchScore(linha.loja_nome_raw, l.nome) <= 1) return true
        if (linha.loja_nome_raw && l.nome_unitrac && matchScore(linha.loja_nome_raw, l.nome_unitrac) <= 1) return true
        return false
      })
      const bate = paradas.some(p => {
        if (p.classificacao === 'LOJA') {
          if (linha.loja_codigo_raw && p.codigo_loja && codCasa(linha.loja_codigo_raw, p.codigo_loja)) return true
          if (matchScore(linha.loja_nome_raw, p.nome_loja || p.local_parada || '') <= 1) return true
        }
        // Bug dia 19 (auditoria 2026-05-27): parada com codigo_loja Unitrac
        // pertencente a OUTRA REDE no cadastro NAO deve casar via geo fallback.
        // Caso KMZ-7057 dia 19: parada cod 560038 SENDAS Petropolis Lj 38
        // estava sendo atribuida a Assai Petropolis Loja 181 via geo (mesma
        // cidade, raio 150m capturava ambas). Bloqueio cross-rede previne.
        if (p.codigo_loja) {
          const lojaCodUnitrac = lojas.find(l => l.codigo_unitrac === p.codigo_loja)
          if (lojaCodUnitrac && !redesFungiveis(linha.rede_id).has(lojaCodUnitrac.rede_id)) {
            // parada pertence a rede diferente — NAO deixa geo fallback salvar
            return false
          }
        }
        // Geo fallback: parada LOJA/FORA_BASE dentro do raio da loja escalada
        if (lojaEscalada && lojaEscalada.lat != null && lojaEscalada.lng != null && p.lat != null && p.lng != null) {
          if (p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE') {
            const dist = haversine(p.lat, p.lng, lojaEscalada.lat, lojaEscalada.lng)
            if (dist <= lojaEscalada.raio_metros) return true
          }
        }
        return false
      })
      if (!bate) return null
    }
    return candidata
  }

  // Mapa: escala_linha_id -> placa do Unitrac (resolvendo OCR-confusable)
  const placaResolvida = new Map<string, string>()
  for (const l of escalaLinhas) {
    if (!l.placa_norm) continue
    const resolved = resolvePlacaUnitrac(l.placa_norm, l)
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
  const crossDockLineIds = new Set<string>()
  const plateTrocaLineIds = new Set<string>()
  const placaSubstituta = new Map<string, string>() // lineId → placa da parada encontrada (T18)
  const matchByEscalaId = new Map<string, UnitracParadaRow>()
  for (const [placa, linhas] of escalaByPlaca) {
    const todas = paradaByPlaca.get(placa) ?? []
    // T20: paradas LOJA com codigo_loja apontando pra cadastro distante do GPS real
    // (geofence Unitrac sobreposta — caso ARMAZEM dia 20 QSZ9A20: cod 5353012 REGINA
    // BARRA IMBUY englobava BASE BENASSI a 60km e Maricá a 90km da loja real).
    // - Se MUITO longe (>10km): RECLASSIFICA como FORA_BASE (não LOJA spurious)
    // - Se moderadamente longe (>500m mas ≤10km): RECLASSIFICA como FORA_BASE e LIMPA
    //   codigo_loja. Cai no geo fallback que atribui à loja mais próxima geograficamente.
    //   Resolve caso 4 lojas REGINA com mesmo cod errado: cada parada GPS perto da
    //   loja real diferente é atribuída corretamente.
    // - Se ≤500m: mantém LOJA com código (caso ideal).
    // T22 (regressão dia 19): primeira parada FORA_BASE de cada loja cadastrada
    // (sem nenhuma LOJA com mesmo cod_unitrac no veículo) → reclassifica como
    // LOJA. O parser PDF do Unitrac às vezes marca "FORA DE BASE E LOCAL DE
    // SERVIÇO" mesmo quando o veículo está no endereço da loja (cliente sem
    // geofence cadastrado no Unitrac). Casos: KNC-1I34 Prezunic Marapendi/JO,
    // UBF-5G36 Prezunic Botafogo Voluntários, QSS-1E48 Atacadão Manilha.
    // Estratégia: marca SÓ a primeira FORA_BASE por loja → demais FORA_BASE
    // colados continuam, caem em estendeSaidaPorForaBase (mesma área).
    const codsLojaJaPresentes = new Set(
      todas.filter(p => p.classificacao === 'LOJA' && p.codigo_loja).map(p => p.codigo_loja as string)
    )
    const t22JaConvertido = new Set<string>() // chave (cod_unitrac || id) já promovida nesta placa
    const t22Promoted = new Map<string, { codigo_unitrac: string | null; nome: string }>()
    // T22 é geo — desligado no modo SEM_GEO
    if (!SEM_GEO) for (const p of todas) {
      if (p.classificacao !== 'FORA_BASE') continue
      if (p.lat == null || p.lng == null) continue
      if (paradaEhRegiaoBase(p.lat, p.lng)) continue
      const lojaPerto = lojas.find(l => {
        if (l.lat == null || l.lng == null) return false
        if (haversine(p.lat!, p.lng!, l.lat, l.lng) > (l.raio_metros ?? 150)) return false
        const chave = l.codigo_unitrac ?? l.id
        if (l.codigo_unitrac && codsLojaJaPresentes.has(l.codigo_unitrac)) return false
        if (t22JaConvertido.has(chave)) return false
        return true
      })
      if (lojaPerto) {
        const chave = lojaPerto.codigo_unitrac ?? lojaPerto.id
        t22JaConvertido.add(chave)
        t22Promoted.set(p.id, { codigo_unitrac: lojaPerto.codigo_unitrac ?? null, nome: lojaPerto.nome })
      }
    }

    const todasAjustadas: typeof todas = todas.map(p => {
      const t22 = t22Promoted.get(p.id)
      if (t22) {
        return {
          ...p,
          classificacao: 'LOJA' as const,
          codigo_loja: t22.codigo_unitrac,
          nome_loja: t22.nome,
        }
      }
      if (p.classificacao !== 'LOJA') return p
      if (!p.codigo_loja || p.lat == null || p.lng == null) return p
      // T20-BASE (regra Tia Erica 2026-05-27): se o GPS está na região da
      // BASE BENASSI (raio 1.5km), a parada É BASE — ignora o cod_loja
      // sobreposto (cliente cadastrou geofence em cima da base).
      // Resolve: KRB-2J76 Sendas Central, KNS-8D26 CAB nas paradas Av Brasil,
      // TML-7D61 NATURCON, SFG-2F72 Assai Barra II base, KVT-5427 Emanuel
      // Rede Economia, etc.
      if (paradaEhRegiaoBase(p.lat, p.lng)) {
        return { ...p, classificacao: 'BASE' as const, codigo_loja: null, nome_loja: null }
      }
      // T20-fix (re-map por proximidade) é geo — no modo SEM_GEO mantém a parada
      // como está (código exato decide; nada de re-mapear por distância).
      if (SEM_GEO) return p
      const lojaCad = lojas.find(l => l.codigo_unitrac === p.codigo_loja)
      if (!lojaCad?.lat || !lojaCad?.lng) return p
      const d = haversine(p.lat, p.lng, lojaCad.lat, lojaCad.lng)
      if (d > 500) {
        // T20-fix dia 19: geofence Unitrac mal cadastrado classifica BASE BENASSI
        // e Lucio Meira/Abastecedora/1 de Maio TODAS como REGINA BARRA IMBUY
        // (cod 5353012). Antes de declarar FORA_BASE, tenta re-mapear para a
        // loja cadastrada FISICAMENTE PRÓXIMA (≤ raio_metros). Caso TML6D96 dia
        // 19: 4 paradas em Petrópolis com lat/lng exato da loja real são
        // re-classificadas corretamente.
        const corrigida = lojas.find(l =>
          l !== lojaCad &&
          l.lat != null && l.lng != null &&
          haversine(p.lat!, p.lng!, l.lat, l.lng) <= (l.raio_metros ?? 150)
        )
        if (corrigida) {
          // Se a corrigida tem cod_unitrac, usa. Senão limpa cod_loja (resolveLojaId
          // resolve por nome/geo Priority 2-4). Mantém classificacao=LOJA pra ser
          // candidata no assignOptimal.
          return {
            ...p,
            codigo_loja: corrigida.codigo_unitrac ?? null,
            nome_loja: corrigida.nome,
          }
        }
        return { ...p, classificacao: 'FORA_BASE' as const, codigo_loja: null, nome_loja: null }
      }
      return p
    })
    const lojasParadasRaw = todasAjustadas.filter((p) => p.classificacao === 'LOJA')
    // V2.1 Reforço 7: placas CD-only crônicas (lista negra) que de fato não saíram
    // do CD nesse dia (zero paradas LOJA) — pula o matching e deixa linhas como
    // UNMATCHED. Evita que o matcher distribua paradas FORA_BASE ou madrugada
    // pra essas placas de apoio.
    if (isVeiculoInativo(placa) && lojasParadasRaw.length === 0) continue
    const lojasConsolidadas = consolidarParadasMesmoCliente(lojasParadasRaw)
    // Remove paradas curtas duplicadas do mesmo codigo_loja: mantém só a de maior duração
    // Depois remove paradas noturnas solitárias (00:01, 01:07 → SEM GPS)
    const lojasParadas = filtrarParadaNocturnaSolitaria(deduplicarPorCodigo(lojasConsolidadas))
    const usados = new Set<string>()

    // T11: pré-computa paradaRedes ANTES do assignOptimal para rede-aware scoring.
    // Antes era calculado só dentro do fallback temporal — agora compartilhado.
    // Inclui aliases (T10): parada SENDAS conta também como ASSAI etc.
    const redesPresentes = [...new Set(lojas.map(l => l.rede_id))]
    const paradaRedes = new Map<string, Set<string>>()
    for (const p of lojasParadas) {
      const redes = new Set<string>()
      for (const r of redesPresentes) {
        if (resolveLojaId(p, lojas, r)) redes.add(r)
      }
      const expanded = new Set<string>()
      for (const r of redes) {
        for (const alias of redesFungiveis(r)) expanded.add(alias)
      }
      paradaRedes.set(p.id, expanded)
    }

    // Optimal assignment: para n≤5 linhas usa brute-force (minimiza total score);
    // para n>5 Hungarian. Score recebe paradaRedes pra penalty +5 quando cross-rede.
    const assigned = assignOptimal(linhas, lojasParadas, paradaRedes, lojas)
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
      // paradaRedes já foi pré-computado acima (T11). Reutiliza.
      // Comentário histórico: parada de PREZUNIC TIJUCA volta com {PREZUNIC} e
      // fica bloqueada pra escalas da ARMAZEM_GRAO. Uma parada SENDAS X - LJ Y
      // ganha {SENDAS, ASSAI} via T10 e desbloqueia ambas.

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
        let melhorScore = Infinity
        let coringaIdx = -1  // T12 coringa: fallback fraco, usado só se nenhum scorePair finito
        // Bug ARMAZEM dia 19 REGINA 1 DE MAIO: TML6D96 fez 14 paradas todas em
        // BARRA IMBUY (cod=5353012). Linha 1 DE MAIO (cod_escala diferente, sem
        // codigo_unitrac cadastrado) compartilha token "REGINA" → scorePair finito.
        // Fallback temporal atribuía uma das paradas cod=5353012 a 1 DE MAIO.
        // Guard: se parada.codigo_loja casa EXATAMENTE com uma loja cadastrada
        // da rede, essa parada só pode ser atribuída à dona dessa loja.
        const fungLin = redesFungiveis(linha.rede_id)
        const candidatasL = lojas.filter(l => {
          if (!fungLin.has(l.rede_id)) return false
          if (linha.loja_codigo_raw && l.codigo_escala === linha.loja_codigo_raw) return true
          if (linha.loja_codigo_raw && l.codigo_unitrac === linha.loja_codigo_raw) return true
          if (matchScore(linha.loja_nome_raw, l.nome) === 0) return true
          if (linha.loja_codigo_raw && l.codigo_unitrac && codCasa(linha.loja_codigo_raw, l.codigo_unitrac)) return true
          return false
        })
        const lojaDaLinha = candidatasL.find(c => c.codigo_unitrac) ?? candidatasL[0]
        for (let j = 0; j < paradasOrdenadas.length; j++) {
          if (usadosFallback.has(j)) continue
          const parada = paradasOrdenadas[j]
          const redes = paradaRedes.get(parada.id) ?? new Set<string>()
          // Bloqueia se a parada bate claramente com outra rede
          if (redes.size > 0 && !redes.has(linha.rede_id)) continue
          // Guard cod_loja dono: parada com codigo_loja que pertence a OUTRA loja
          // cadastrada (qualquer rede) não pode ser atribuída a esta linha.
          if (parada.codigo_loja) {
            const donaCadastrada = lojas.find(l => l.codigo_unitrac === parada.codigo_loja)
            const fung = redesFungiveis(linha.rede_id)
            if (donaCadastrada && lojaDaLinha && donaCadastrada.id !== lojaDaLinha.id) {
              // Duplicata: lojaDaLinha sem cod_unitrac + dona em rede fungível = mesma loja
              if (!(lojaDaLinha.codigo_unitrac == null && fung.has(donaCadastrada.rede_id))) continue
            }
            if (donaCadastrada && !lojaDaLinha) {
              const nomeBate = matchScore(linha.loja_nome_raw, donaCadastrada.nome) <= 1
              if (!fung.has(donaCadastrada.rede_id) && !nomeBate) continue
            }
          }
          // Critério primário: escolhe a parada com MENOR scorePair (a mais parecida
          // com a loja escalada), NÃO a primeira cronológica. Bug #255: quando várias
          // paradas livres têm score finito, a primeira no tempo nem sempre é a certa
          // (ex: LOJA 06 às 04h vs LOJA 30 às 06h — score 0 da 30 deve ganhar).
          // paradasOrdenadas já está em ordem cronológica → `<` estrito mantém a mais
          // antiga em empate de score.
          const sPar = scorePair(linha, parada)
          if (sPar < Infinity && sPar < melhorScore) {
            melhorScore = sPar
            melhorIdx = j
          }
          // T12: Rede fallback agora SÓ aceita paradas SEM rede identificada (coringa).
          // Antes aceitava também parada com rede igual à da escala (redes.has(linha.rede_id)),
          // o que produzia falso positivo "rede certa, loja errada". Ex KUL1425:
          // escala PREZUNIC PECHINCHA, parada cadastrada PREZUNIC VILA ISABEL (loja
          // física DIFERENTE, sem tokens em comum). Sem T12, o `redes.has(PREZUNIC)`
          // aceitava e o KPI saía com horários da loja errada — pior que UNMATCHED.
          // Agora: só parada não-identificada (redes.size === 0) entra como coringa.
          // Registrado como fallback fraco (cronologicamente primeiro); aplicado só
          // se nenhuma parada teve scorePair finito (melhorIdx continua -1).
          if (coringaIdx === -1 && linhasOrdenadas.length === 1 && redes.size === 0) {
            coringaIdx = j
          }
        }
        if (melhorIdx === -1 && coringaIdx >= 0) melhorIdx = coringaIdx
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
      // Regra Tia Erica (2026-05-27): paradas FORA_BASE/FAKE_EXIT NUNCA são entrega.
      // "Base vai estar escrito base, cliente vai estar escrito a LOJA. Fora de base
      // não foi nem ao cliente nem à base". Geo fallback agora restrito a paradas
      // já classificadas LOJA pelo parser Unitrac mas não casadas via Priority 1-3
      // do resolveLojaId (cod/nome). Aceitar FORA_BASE/FAKE_EXIT gerava falsos
      // positivos massivos (Princesa Niterói Barcas, ZS Loja 01/09/22/25/30/47,
      // Prezunic Jardim Oceanico, etc).
      const paradasForaBase = todasAjustadas
        .filter(p =>
          p.classificacao === 'LOJA' &&
          p.lat != null && p.lng != null &&
          !usados.has(p.id) &&
          new Date(p.chegada).getUTCHours() >= 3
        )
        .sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())

      // Geo-R guard refinado: bloqueia somente se a LOJA órfã pertence à MESMA rede
      // das linhas sem match. Caso multi-cliente (QST4C52 dia 19: fez PRINCESA BUZIOS
      // depois ARMAZEM Petrópolis), a LOJA órfã PRINCESA não deve bloquear geo-match
      // de FORA_BASE para linhas ARMAZEM. Antes bloqueava qualquer órfã, gerando FN.
      // Caso original TML3B11 ainda protegido: LOJA órfã PREZUNIC vs escala VIANENSE
      // — se VIANENSE está nas redes da órfã (alias), bloqueia.
      const redesSemMatch = new Set(linhasAindaSemMatch.map(l => l.rede_id))
      // Geo-R guard: usa lojasParadas (pós-consolidação) — NÃO todasAjustadas — pra
      // detectar LOJA órfãs legítimas. Bug 3 dia 19 LQE5401 mostrou que a mesma loja
      // pode aparecer 2x em todasAjustadas (parser XLSX + parser PDF emitem 2 paradas
      // com ids diferentes mas chegadas que diferem em 2 segundos). consolidarParadasMesmoCliente
      // funde as duas em lojasParadas (1 entrada com id da maior duração), mas a parada
      // original "perdida" continua em todasAjustadas. assignOptimal usa só lojasParadas
      // → marca em `usados` o id consolidado → a outra duplicata em todasAjustadas
      // fica "órfã da mesma rede" e BLOQUEIA o geo-fallback FORA_BASE. Resultado: lojas
      // que dependem do geo-fallback (Loja 47 Catete via FORA_BASE 19:40 a 15m) ficavam
      // UNMATCHED.
      //
      // T20 ainda protegido: lojasParadasRaw = todasAjustadas.filter(LOJA), então as
      // paradas reclassificadas (LOJA spurious → FORA_BASE) JÁ ficam fora de lojasParadas.
      const temLojaOrfaMesmaRede = lojasParadas.some(p => {
        if (usados.has(p.id)) return false
        // Infere rede da parada órfã
        for (const r of redesSemMatch) {
          if (resolveLojaId(p, lojas, r)) return true
        }
        return false
      })

      // Geo-R: pula se LOJA órfã é da mesma rede da linha (FP cross-rede); permite
      // se órfã é de outra rede (motorista fez multi-cliente).
      // Bloco inteiro é geo — desligado no modo SEM_GEO.
      if (!SEM_GEO && !temLojaOrfaMesmaRede) {
        const usadosGeo = new Set<number>()
        // Inverte loop: pra cada parada, acha loja mais próxima na rede e atribui
        // à LINHA correspondente (não à primeira linha iterada). Antes, BARRA DO IMBUY
        // recebia parada que estava perto da 1 DE MAIO porque só checava "bate alguma
        // loja da rede" sem amarrar à linha certa.
        for (let j = 0; j < paradasForaBase.length; j++) {
          if (usadosGeo.has(j)) continue
          const p = paradasForaBase[j]

          // Acha melhor loja da rede para esta parada (entre as linhas SEM match)
          const redesNasLinhas = new Set(linhasAindaSemMatch.map(l => l.rede_id))
          const lojasCandidatas: { loja: typeof lojas[0]; dist: number }[] = []
          for (const ll of lojas) {
            if (!redesNasLinhas.has(ll.rede_id)) continue
            if (ll.lat == null || ll.lng == null) continue
            const d = haversine(p.lat!, p.lng!, ll.lat, ll.lng)
            if (d <= ll.raio_metros) lojasCandidatas.push({ loja: ll, dist: d })
          }
          lojasCandidatas.sort((a, b) => a.dist - b.dist)

          // Tenta cada loja candidata (mais próxima primeiro) buscando linha com MELHOR
          // matchScore (não primeiro find). Linhas da mesma rede compartilham token
          // comum (ex: 4 REGINA têm "REGINA") — sem ordenar por score, find pega a
          // primeira por carro_ordem e atribui parada ao errado.
          let atribuido = false
          for (const { loja: cand } of lojasCandidatas) {
            let bestLinha: typeof linhasAindaSemMatch[0] | null = null
            let bestScore = Infinity
            for (const l of linhasAindaSemMatch) {
              if (matchByEscalaId.has(l.id)) continue
              if (l.rede_id !== cand.rede_id) continue
              let s: number
              if (l.loja_codigo_raw && cand.codigo_escala === l.loja_codigo_raw) s = 0
              else s = matchScore(l.loja_nome_raw, cand.nome)
              if (s <= 2 && s < bestScore) {
                bestScore = s
                bestLinha = l
              }
            }
            if (bestLinha) {
              matchByEscalaId.set(bestLinha.id, p)
              usados.add(p.id)
              usadosGeo.add(j)
              geoMatchedLineIds.add(bestLinha.id)
              atribuido = true
              break
            }
          }

          // Fallback canonical_loja se nenhuma loja da rede bateu por geo+nome.
          // Guard cod_loja dono: se a parada tem cod_loja cadastrado em loja
          // diferente da linha alvo (rede não-fungível e nome não bate), não
          // atribui — caso Sams Barra NSM6D98 ganhando PREZUNIC MEIER ou
          // ZS L19 KMY5561 ganhando CARREFOUR BARRA.
          if (!atribuido && (geoStores ?? []).length > 0) {
            const bateCanonical = resolveForaBaseGeo(p.lat!, p.lng!, geoStores!)
            if (bateCanonical) {
              const linhaAlvo = linhasAindaSemMatch.find(l => !matchByEscalaId.has(l.id))
              if (linhaAlvo) {
                let bloqueia = false
                if (p.codigo_loja) {
                  const dona = lojas.find(l => l.codigo_unitrac === p.codigo_loja)
                  if (dona) {
                    const fungAlvo = redesFungiveis(linhaAlvo.rede_id)
                    const nomeBate = matchScore(linhaAlvo.loja_nome_raw, dona.nome) <= 1
                    if (!fungAlvo.has(dona.rede_id) && !nomeBate) bloqueia = true
                  }
                }
                if (!bloqueia) {
                  matchByEscalaId.set(linhaAlvo.id, p)
                  usados.add(p.id)
                  usadosGeo.add(j)
                  geoMatchedLineIds.add(linhaAlvo.id)
                }
              }
            }
          }
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
        // Compartilha parada APENAS quando scorePair === 0 (match exato).
        // Guard de distância: se a linha tem loja cadastrada com lat/lng E a parada
        // candidata tem lat/lng, exige distância ≤ 500m. Sem isso, scorePair retorna
        // 0 quando local_parada cita N lojas (ARMAZEM dia 20: parada BARRA IMBUY tem
        // local "5353012 IMBUY, 5353014 MAIO, 5353016 LUCIO, 5353017 ABASTECEDORA")
        // e clona pra todas. Geograficamente é apenas BARRA IMBUY.
        const fungLinComp = redesFungiveis(linha.rede_id)
        const candidatasComp = lojas.filter(l => {
          if (!fungLinComp.has(l.rede_id)) return false
          if (linha.loja_codigo_raw && l.codigo_escala === linha.loja_codigo_raw) return true
          if (linha.loja_codigo_raw && l.codigo_unitrac === linha.loja_codigo_raw) return true
          if (matchScore(linha.loja_nome_raw, l.nome) === 0) return true
          if (linha.loja_codigo_raw && l.codigo_unitrac && codCasa(linha.loja_codigo_raw, l.codigo_unitrac)) return true
          return false
        })
        const lojaCad = candidatasComp.find(c => c.codigo_unitrac) ?? candidatasComp[0]
        const compartilhada = paradasUsadasNaPlaca.find(p => {
          if (scorePair(linha, p) !== 0) return false
          // Guard cod_loja dono: se a parada tem codigo_loja casando com OUTRA
          // loja cadastrada da rede, não compartilha. Caso REGINA dia 19: parada
          // cod=5353012 (BARRA IMBUY) não pode virar entrega da 1 DE MAIO mesmo
          // que share token REGINA e estejam <500m.
          if (p.codigo_loja) {
            const dona = lojas.find(l => l.codigo_unitrac === p.codigo_loja)
            if (dona && lojaCad && dona.id !== lojaCad.id) {
              if (!(lojaCad.codigo_unitrac == null && fungLinComp.has(dona.rede_id))) return false
            }
            if (dona && !lojaCad) return false
          }
          if (lojaCad?.lat != null && lojaCad?.lng != null && p.lat != null && p.lng != null) {
            const d = haversine(lojaCad.lat, lojaCad.lng, p.lat, p.lng)
            return d <= 500
          }
          return true
        })
        if (compartilhada) {
          matchByEscalaId.set(linha.id, compartilhada)
          // NÃO marca em usados — outras linhas podem compartilhar também
        }
      }
    }

    // T8 — Fallback N:N por placa+rede. Quando o nº de linhas sem match de uma rede
    // === nº de paradas LOJA livres atribuíveis àquela rede, atribuir 1:1 por ordem
    // (carro_ordem da escala × ordem temporal da parada). Cobre PAX/Armazém sem código
    // onde os nomes divergem mas a estrutura (mesma quantidade de paradas) bate.
    //
    // Restrito por rede pra evitar cross-rede (Armazém pegando parada Princesa).
    const linhasFinalSem = linhas.filter(l => !matchByEscalaId.has(l.id))
    const paradasLojaLivres = lojasParadas.filter(p => !usados.has(p.id))
    if (linhasFinalSem.length > 0 && paradasLojaLivres.length > 0) {
      // Infere rede de cada parada via cadastro `lojas`. Paradas não identificadas
      // (redeInf=null) viram coringas atribuíveis a qualquer rede da escala.
      // Reutiliza `redesPresentes` declarado acima (T11) — evita shadowing.
      //
      // T8-X (bug 2A dia 19): se a parada tem codigo_loja/nome_unitrac que casa
      // EXATAMENTE com cadastro de QUALQUER rede, essa rede é a verdadeira da
      // parada — bloqueia atribuição a outra rede mesmo que GEO fallback case.
      // Caso ZS Loja 07 dia 19: FHO5F88 fez SUPERPRIX 3030201 (cod cadastrado em
      // SUPERPRIX), mas GEO da parada caía dentro do raio da Loja 40 ZS Ipanema
      // (116m). Sem T8-X, T8 N:N atribuía parada SUPERPRIX como entrega ZS Loja 07.
      const paradaRedeInfer = new Map<string, string | null>()
      for (const p of paradasLojaLivres) {
        let redeInf: string | null = null
        // Pass 1: codigo/nome exato (priorities 1-2 do resolveLojaId — SEM GEO).
        // Garante que parada com cod cadastrado em uma rede NÃO migre pra outra
        // rede só porque GEO overlapping captura loja vizinha cadastrada.
        if (p.codigo_loja || p.nome_loja) {
          for (const r of redesPresentes) {
            const redeLojas = lojas.filter(l => l.rede_id === r)
            let bate = false
            if (p.codigo_loja) {
              bate = redeLojas.some(l => l.codigo_unitrac === p.codigo_loja)
            }
            if (!bate && p.nome_loja) {
              const normPar = p.nome_loja.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
              bate = redeLojas.some(l => {
                if (!l.nome_unitrac) return false
                return l.nome_unitrac.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === normPar
              })
            }
            if (bate) { redeInf = r; break }
          }
        }
        // Pass 2: fallback completo (inclui GEO) — só se nada bateu em codigo/nome.
        if (!redeInf) {
          for (const r of redesPresentes) {
            if (resolveLojaId(p, lojas, r)) { redeInf = r; break }
          }
        }
        paradaRedeInfer.set(p.id, redeInf)
      }

      const redesNasLinhasSem = [...new Set(linhasFinalSem.map(l => l.rede_id))]
      // Redes onde a Unitrac usa geofences rota gigante que englobam várias lojas
      // da mesma rede física (caso típico: ARMAZEM_GRAO — paradas REGINA cobrem
      // BOA VISTA/POSSE/16 DE MARÇO/MATRIZ). Pra essas, aceita match cronológico
      // quando há paradas SUFICIENTES (linhas ≤ paradas), sem exigir igualdade.
      const REDES_GEOFENCE_AGREGADO = new Set(['ARMAZEM_GRAO'])
      for (const rede of redesNasLinhasSem) {
        const linhasDaRede = linhasFinalSem.filter(l => l.rede_id === rede)
        // T10: aceita paradas das redes aliased (ASSAI ↔ SENDAS, PAX ↔ SUPER_PAX)
        const redesAceitas = redesFungiveis(rede)
        const paradasDaRede = paradasLojaLivres.filter(p => {
          if (usados.has(p.id)) return false
          const redeInf = paradaRedeInfer.get(p.id) ?? null
          return redeInf === null || redesAceitas.has(redeInf)
        })
        const numIguais = linhasDaRede.length === paradasDaRede.length
        const redeAgregada = REDES_GEOFENCE_AGREGADO.has(rede)
        const aceitaParcial = redeAgregada && paradasDaRede.length >= linhasDaRede.length && linhasDaRede.length > 0
        if ((numIguais || aceitaParcial) && linhasDaRede.length > 0) {
          const linhasOrd = [...linhasDaRede].sort((a, b) => a.carro_ordem - b.carro_ordem)
          const paradasOrd = [...paradasDaRede].sort(
            (a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime()
          )
          // Atribui min(linhas, paradas). No caso aceitaParcial pega as N primeiras
          // paradas cronológicas — convenção: 1ª chegada = 1ª linha da escala.
          const n = Math.min(linhasOrd.length, paradasOrd.length)
          for (let i = 0; i < n; i++) {
            const linha = linhasOrd[i]
            const parada = paradasOrd[i]
            // Guard cod_loja dono (mesmo do scoreComRede e fallback temporal):
            // se parada tem cod_loja casando com loja cadastrada ≠ loja da linha,
            // pula. Caso ZS L07 RODRIGO/KWK4593 dia 19: T8 N:N atribuía parada
            // cod=9039103 (Loja 21) à linha Loja 07 cronologicamente.
            if (parada.codigo_loja) {
              const dona = lojas.find(l => l.codigo_unitrac === parada.codigo_loja)
              const fungL = redesFungiveis(linha.rede_id)
              const candidatasT8 = lojas.filter(c => {
                if (!fungL.has(c.rede_id)) return false
                if (linha.loja_codigo_raw && c.codigo_escala === linha.loja_codigo_raw) return true
                if (linha.loja_codigo_raw && c.codigo_unitrac === linha.loja_codigo_raw) return true
                if (matchScore(linha.loja_nome_raw, c.nome) === 0) return true
                if (linha.loja_codigo_raw && c.codigo_unitrac && codCasa(linha.loja_codigo_raw, c.codigo_unitrac)) return true
                return false
              })
              const lojaL = candidatasT8.find(c => c.codigo_unitrac) ?? candidatasT8[0]
              if (dona && lojaL && dona.id !== lojaL.id) {
                if (!(lojaL.codigo_unitrac == null && fungL.has(dona.rede_id))) continue
              }
              if (dona && !lojaL) {
                const nomeBate = matchScore(linha.loja_nome_raw, dona.nome) <= 1
                if (!fungL.has(dona.rede_id) && !nomeBate) continue
              }
            }
            matchByEscalaId.set(linha.id, parada)
            usados.add(parada.id)
          }
        }
      }
    }

    // T9 — Cross-docking detection (último recurso, depois de T8). Quando a placa
    // carrega 2+ redes e UMA delas é uma rede de "carona" (cross-dock conhecido:
    // ARMAZEM_GRAO, FEIRA_NOVA — caminhões pequenos que pegam carona em rotas
    // maiores tipo Princesa/Prezunic) com 0 matches, distribui as paradas das
    // redes primárias (já matched) para as linhas órfãs por carro_ordem.
    // Linhas atribuídas via T9 são marcadas em `crossDockLineIds` pra receber
    // confidence=LOW e requiresReview=true (R1 ressalva: cross-dock é heurística,
    // não match certeiro).
    //
    // Restrito a redes de carona conhecidas pra evitar falso positivo cross-rede
    // genérico (ex: VIANENSE pegando parada SENDAS por estar na mesma placa).
    // NÃO marca em usados — herança via cross-dock é reuso de parada, não consumo.
    // ARMAZEM_GRAO removido: entrega à tarde em rota própria (Petrópolis/Itaipava),
    // não é cross-dock real com Prezunic/Princesa. T9 estava atribuindo paradas
    // da manhã de outra rede às linhas ARMAZEM_GRAO, produzindo horários errados.
    const REDES_CROSSDOCK = new Set(['FEIRA_NOVA'])
    const redesNaPlaca = new Set(linhas.map(l => l.rede_id))
    if (redesNaPlaca.size >= 2) {
      // Paradas LOJA já atribuídas a alguma linha dessa placa (recoletadas após T8)
      const paradasUsadasFinal: UnitracParadaRow[] = []
      const setParadasUsadas = new Set<string>()
      for (const l of linhas) {
        const m = matchByEscalaId.get(l.id)
        if (m && m.classificacao === 'LOJA' && !setParadasUsadas.has(m.id)) {
          paradasUsadasFinal.push(m)
          setParadasUsadas.add(m.id)
        }
      }
      // Linhas órfãs em rede de carona
      const linhasOrfas = linhas.filter(l =>
        !matchByEscalaId.has(l.id) && REDES_CROSSDOCK.has(l.rede_id)
      )
      if (linhasOrfas.length > 0 && paradasUsadasFinal.length > 0) {
        const orfasPorRede = new Map<string, EscalaLinhaRow[]>()
        for (const l of linhasOrfas) {
          const arr = orfasPorRede.get(l.rede_id) ?? []
          arr.push(l)
          orfasPorRede.set(l.rede_id, arr)
        }
        const paradasOrd = [...paradasUsadasFinal].sort(
          (a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime()
        )
        for (const linhasDaRedeOrfa of orfasPorRede.values()) {
          const linhasOrd = [...linhasDaRedeOrfa].sort((a, b) => a.carro_ordem - b.carro_ordem)
          for (let i = 0; i < linhasOrd.length; i++) {
            // Bug M4 (matcher audit dia 19): antes clonava a ULTIMA parada pra
            // todas as linhas órfãs extras (3 linhas + 1 parada → 3 timestamps
            // identicos, GPS clonado entre lojas). Fix: se i >= paradasOrd.length,
            // deixa unmatched (continue) em vez de clonar.
            if (i >= paradasOrd.length) continue
            const parada = paradasOrd[i]
            if (parada) {
              matchByEscalaId.set(linhasOrd[i].id, parada)
              crossDockLineIds.add(linhasOrd[i].id)
            }
          }
        }
      }
    }
  }

  // T18 — Plate-swap fallback.
  // Escala lines sem match: busca parada LOJA de qualquer outra placa que corresponda
  // à loja esperada por código, nome ou GPS (troca de veículo não registrada na escala,
  // ou veículo com GPS mas sem parada na loja correta).
  {
    // T18-G: exclui linhas GPS:NAO (placa não existe no Unitrac) do plate-swap.
    // Veículo sem rastreador → manual registra SEM; T18 buscaria um veículo passando
    // perto da loja e produziria FP. Apenas veículos que TÊM dados no Unitrac mas cuja
    // parada não foi identificada (ex: classificada FORA_BASE) são candidatos reais de
    // troca de placa.
    //
    // T18-Orphan: exclui linhas cujo veículo tem parada LOJA não atribuída a nenhuma
    // escala_linha (parada "órfã"). Indica que o veículo entregou em outra rede mas
    // não nas lojas desta escala; T18 buscaria parada de outro veículo perto da loja
    // e produziria FP (caso TML3B11: LOJA=PREZUNIC TIJUCA, escala=VIANENSE).
    // Nota: manter any-orphan (não só cross-rede) �� veículos com múltiplas LOJA
    // paradas da mesma rede criam FPs se T18 fica desbloqueado para suas linhas restantes.
    const matchedParadaIds = new Set([...matchByEscalaId.values()].map(p => p.id))
    const semGpsLines = escalaLinhas.filter(l => {
      if (!l.placa_norm || matchByEscalaId.has(l.id)) return false
      const placaRes = resolvePlacaUnitrac(l.placa_norm, l)
      // T18 ativa pra placas ausentes do Unitrac também (caso ZS dia 19 Loja 33:
      // escala diz LCO0978 mas operação foi com BBH1C94 — Tia Érica trocou placa).
      // Antes T18-G excluía placas ausentes pra evitar FP "veículo passando perto",
      // mas guards de DISTÂNCIA (T18-D ≤5km do cadastro), CÓDIGO/NOME (scorePair ≤2)
      // e RAIO (cadastro com lat/lng) já dão proteção suficiente.
      if (!placaRes) return true // placa ausente: candidato pra plate-swap
      const paradaDoVeiculo = paradaByPlaca.get(placaRes) ?? []
      // T18 plate-swap: ativa apenas quando placa está "inativa" no Unitrac:
      // - placa totalmente ausente (rastreador off), OU
      // - placa só com paradas BASE (motorista ficou no CD), OU
      // - placa com LOJA órfã (entregou em outra rede — possível plate-swap).
      //
      // Se a placa tem FORA_BASE (motorista circulou fora da BASE) sem nenhuma
      // LOJA, ele rodou mas não entregou → manual diria NAO_FOI. T18 não deve
      // atribuir paradas LOJA de outras placas. Caso ARMAZEM dia 21 QSU6I54:
      // GILSON tinha BASE + FORA_BASE, T18 antigo pegava paradas de OUTRAS placas
      // para as 4 linhas REGINA dele.
      if (paradaDoVeiculo.length > 0) {
        const temLojaOrfa = paradaDoVeiculo.some(
          p => p.classificacao === 'LOJA' && !matchedParadaIds.has(p.id),
        )
        const soBase = paradaDoVeiculo.every(p => p.classificacao === 'BASE')
        if (!temLojaOrfa && !soBase) return false
      }
      return true
    })
    if (semGpsLines.length > 0) {
      const todasLojaParadas = paradaRows.filter(p => p.classificacao === 'LOJA')

      // T18-R: precomputa redes de cada parada para guard de rede.
      // Paradas com rede identificada só casam com linhas da mesma rede (ou alias).
      // Paradas sem rede cadastrada (coringas) só casam se scorePair <= 2 ou GPS bater —
      // impede que token genérico como "BARRA" faça "ROTA BARRA" bater com "GB BARRA 7",
      // ou que "CAXIAS" faça "SENDAS CAXIAS LJ 131" bater com "GB CAXIAS 18".
      const redesPresentesT18 = [...new Set(lojas.map(l => l.rede_id))]
      const paradaRedesT18 = new Map<string, Set<string>>()
      for (const p of todasLojaParadas) {
        const redes = new Set<string>()
        for (const r of redesPresentesT18) {
          if (resolveLojaId(p, lojas, r)) redes.add(r)
        }
        paradaRedesT18.set(p.id, redes)
      }

      const usedIds = new Set<string>([...matchByEscalaId.values()].map(p => p.id))

      // Expande usedIds: consolidarParadasMesmoCliente pode ter fundido N paradas raw numa
      // só (ID = primeira raw). As paradas raw "irmãs" (mesma placa + codigo_loja) ficam
      // com IDs distintos e não são bloqueadas, abrindo falso slot para T18. Bloqueia todas.
      for (const matched of matchByEscalaId.values()) {
        if (!matched.codigo_loja || !matched.placa_norm) continue
        for (const p of todasLojaParadas) {
          if (p.placa_norm === matched.placa_norm && p.codigo_loja === matched.codigo_loja) {
            usedIds.add(p.id)
          }
        }
      }

      // T18-F (fully-matched guard): placas que têm escala e já estão 100% resolvidas
      // não devem fornecer paradas extras para T18. Um veículo já completamente matched
      // que passou perto de outra loja (parada "incidental") causaria T18 FP para
      // veículos GPS:NAO que não têm rastreador. Só veículos SEM escala (puro GPS)
      // são candidatos legítimos de plate-swap.
      {
        const escalaLinesByPlaca = new Map<string, number>()
        const matchedLinesByPlaca = new Map<string, number>()
        for (const l of escalaLinhas) {
          if (!l.placa_norm) continue
          escalaLinesByPlaca.set(l.placa_norm, (escalaLinesByPlaca.get(l.placa_norm) ?? 0) + 1)
          if (matchByEscalaId.has(l.id))
            matchedLinesByPlaca.set(l.placa_norm, (matchedLinesByPlaca.get(l.placa_norm) ?? 0) + 1)
        }
        for (const [placa, total] of escalaLinesByPlaca) {
          const matched = matchedLinesByPlaca.get(placa) ?? 0
          if (matched >= total) {
            // Placa 100% matched: bloquear todas as paradas dela para T18
            for (const p of todasLojaParadas) {
              if (p.placa_norm === placa) usedIds.add(p.id)
            }
          }
        }
      }

      for (const linha of semGpsLines) {
        // Tenta encontrar a loja no cadastro para usar GPS como fallback.
        // Bug 7 fix: quando MÚLTIPLAS lojas da rede dão matchScore ≤ 1 (token
        // qualificador comum tipo "Serra Azul"), `find` retornava a PRIMEIRA, que pode
        // ser cadastro diferente do escalado. Caso PREZUNIC dia 19: escala "Prezunic -
        // Jauru / Serra Azul" — `find` retornava "Prezunic - Catumbi Serra Azul"
        // (score=1) em vez de PREZUNIC JAURU (score=2). T18 usava lat/lng de Catumbi
        // como referência de T18-D (≤5km), aceitando paradas longe de Jauru.
        // Fix: prioridade — (1) código exato, (2) menor matchScore, com fallback
        // a busca ampla. lojaEscalaAmbigua=true quando múltiplas lojas empatam no
        // menor score (token discriminador não único) — sinaliza pra T18-X bloquear
        // qualquer match cross-loja.
        let lojaEscala: typeof lojas[0] | undefined
        let lojaEscalaAmbigua = false
        if (linha.loja_codigo_raw) {
          lojaEscala = lojas.find(l => l.rede_id === linha.rede_id && l.codigo_escala === linha.loja_codigo_raw)
        }
        if (!lojaEscala) {
          const candidatas = lojas
            .filter(l => l.rede_id === linha.rede_id)
            .map(l => ({ l, s: matchScore(linha.loja_nome_raw, l.nome) }))
            .filter(x => x.s <= 2)
            .sort((a, b) => a.s - b.s)
          if (candidatas.length > 0) {
            lojaEscala = candidatas[0].l
            // Múltiplos com mesmo menor score → ambíguo (caso Prezunic "Serra Azul")
            if (candidatas.length > 1 && candidatas[0].s === candidatas[1].s) {
              lojaEscalaAmbigua = true
            }
          }
        }
        const redesFungT18 = redesFungiveis(linha.rede_id)
        const candidatas = todasLojaParadas.filter(p => {
          if (usedIds.has(p.id)) return false
          // T18-N removido: ZS faz entregas de madrugada legitimamente (caminhão carregado
          // 17h dia anterior sai dia seguinte 04-06h). Vídeo v43-2 Tia Érica confirma.
          // Guard de DISTÂNCIA (T18-D abaixo) e RAIO da loja (≤5km do cadastro) já evita FP
          // de veículos estacionados aleatoriamente perto.
          // T18-D: guard de distância. Se a linha da escala tem loja com lat/lng
          // cadastrado, a parada candidata DEVE estar a no máximo 5km da loja.
          // Caso ARMAZEM dia 19 MATRIZ POSSE: parada KRB2J76 "MATRIZ CD DUQUE" tem
          // token "MATRIZ" comum mas fica 47km longe da POSSE em Petrópolis.
          if (lojaEscala?.lat != null && lojaEscala?.lng != null && p.lat != null && p.lng != null) {
            const distM = haversine(lojaEscala.lat, lojaEscala.lng, p.lat, p.lng)
            if (distM > 5000) return false
          }
          // T18-R: guard de rede
          const redesDaParada = paradaRedesT18.get(p.id) ?? new Set<string>()
          if (redesDaParada.size > 0) {
            // Rede identificada: só aceita se compatível com a rede da escala
            if ([...redesDaParada].every(r => !redesFungT18.has(r))) return false
            // T18-X: se a parada resolve para uma loja CADASTRADA diferente da escalada,
            // rejeitar. Caso ZS Loja 1129 (não cadastrada): T18 atribuía parada MEGA BOX
            // OLARIA (cadastrada) pelo token comum "OLARIA". Sem este guard, lojas com
            // tokens geográficos em comum casavam por engano.
            const lojaIdParada = resolveLojaId(p, lojas, linha.rede_id)
            if (lojaIdParada) {
              const lojaPar = lojas.find(l => l.id === lojaIdParada)
              if (lojaPar) {
                const codigoBate = !!(linha.loja_codigo_raw && (
                  (lojaPar.codigo_escala && codCasa(linha.loja_codigo_raw, lojaPar.codigo_escala)) ||
                  (lojaPar.codigo_unitrac && codCasa(linha.loja_codigo_raw, lojaPar.codigo_unitrac))
                ))
                const nomeBate = matchScore(linha.loja_nome_raw, lojaPar.nome) <= 1
                if (!codigoBate && !nomeBate) return false
                // T18-X2 (Bug 7): mesmo com nomeBate, exige que o cadastro identificado
                // seja IGUAL ao cadastro da loja escalada. Caso PREZUNIC dia 19:
                // escala "Prezunic - Jauru / Serra Azul" → cadastro PREZUNIC JAURU,
                // mas parada UBO5E01 (Sendas Bangu) tem geo→Catumbi Serra Azul (matchScore
                // 1 via SERRA+AZUL). Sem este guard, T18-X aceitava (nomeBate=true). Agora:
                // se ambos lojaEscala e lojaPar foram identificados e são diferentes, rejeita.
                // Também rejeita quando lojaEscalaAmbigua (múltiplos cadastros empatam no
                // matchScore — token discriminador da escala não é único, alto risco de FP).
                if (lojaEscalaAmbigua) return false
                if (lojaEscala && lojaPar.id !== lojaEscala.id) return false
              }
            }
            // Exige match próximo (≤ 2 tokens de diferença) — evita FP por tokens genéricos
            // como "BARRA" ou "LOJA" que aparecem em múltiplas lojas diferentes.
            return scorePair(linha, p) <= 2
          }
          // Coringa (sem rede): exige score ≤ 2 — geo fallback removido para evitar FP
          // de paradas de outras cadeias geograficamente próximas (ex: Guanabara Barra).
          // T18-X2-Coringa (Bug 7): quando lojaEscala é ambígua (cadastro tem token
          // qualificador comum como "Serra Azul"), exige score=0 (match perfeito) para
          // evitar FP por tokens genéricos do cadastro.
          if (lojaEscalaAmbigua) return scorePair(linha, p) === 0
          return scorePair(linha, p) <= 2
        })
        if (!candidatas.length) continue
        candidatas.sort((a, b) => {
          const sa = scorePair(linha, a), sb = scorePair(linha, b)
          if (sa !== sb) return sa - sb
          return new Date(a.chegada).getTime() - new Date(b.chegada).getTime()
        })
        const best = candidatas[0]
        matchByEscalaId.set(linha.id, best)
        usedIds.add(best.id)
        plateTrocaLineIds.add(linha.id)
        placaSubstituta.set(linha.id, best.placa_norm)
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

    const placaUnitrac = placaResolvida.get(linha.id) ?? placaSubstituta.get(linha.id) ?? linha.placa_norm
    const todasParadas = paradaByPlaca.get(placaUnitrac) ?? []
    // Saída CD: última saída da BASE BENASSI antes da primeira parada operacional.
    // "Operacional" = primeira LOJA, ou primeira FORA_BASE DEPOIS de ter visitado a BASE.
    // FORA_BASE de madrugada (antes de ir pra base) é ignorada — o caminhão pode ter
    // começado o tracking longe do CD sem isso indicar início das entregas.
    // ATENÇÃO: existe uma segunda implementação em unitrac.ts:computeSaidaCd (parser).
    // Aquela versão grava no DB mas é ignorada aqui — esta recomputa do zero.
    // T16: saída CD agora é por-parada (vê computeSaidaCdParaParada).
    // Calcula depois de resolver `matched` — cada linha tem sua própria saída.
    const matched = matchByEscalaId.get(linha.id)
    const isGeo = geoMatchedLineIds.has(linha.id)
    const isCrossDock = crossDockLineIds.has(linha.id)
    const isPlateTroca = plateTrocaLineIds.has(linha.id)

    let saida_cd: Date | null = null
    if (matched) {
      // Usa a parada matched como alvo: a saída-CD é a última saída de BASE
      // estritamente antes da chegada dessa parada. Cobre multi-trip:
      // Trip 1 e Trip 2 pegam saídas diferentes (cada uma da sua BASE anterior).
      saida_cd = computeSaidaCdParaParada(matched, todasParadas, { redeId: linha.rede_id, data: linha.data_entrega })
    }
    // Sem match: saida_cd fica null. Não usar fallback com primeira parada da placa —
    // para veículos multi-trip (PREZUNIC manhã + ZONA_SUL noite), isso produzia a
    // saída da manhã para linhas da noite, que é pior que deixar em branco.

    let lojaId: string | null = null
    let nomeResolvido: string = ''
    let metaAlgorithm: MatchAlgorithm = 'hybrid'

    if (matched) {
      const nomeRaw = matched.nome_loja ?? matched.local_parada ?? ''
      lojaId = resolveLojaId(matched, lojas, linha.rede_id)
      nomeResolvido = nomeRaw

      if (isCrossDock) {
        // T9 — cross-dock é heurística; sinaliza pra operador revisar.
        metaAlgorithm = 'crossdock'
      } else if (isPlateTroca || isGeo) {
        metaAlgorithm = 'geo'
      } else if (!lojaId && trgmResults[linha.loja_nome_raw]) {
        // trgm fallback: enriquece loja_id quando resolveLojaId retornou null
        const trgm = trgmResults[linha.loja_nome_raw]
        lojaId = trgm.canonical_id
        nomeResolvido = trgm.canonical_nm
        metaAlgorithm = 'trgm'
      }
    }

    // Bug 6: chama estendeSaidaPorForaBase mesmo em isGeo. Quando matched=FORA_BASE/
    // FAKE_EXIT (geo-fallback p/ loja sem geofence LOJA), a SL real é a saída do
    // último FORA_BASE da cadeia adjacente (não do primeiro matched). A própria
    // função decide se estende baseado em classificação + critérios geo/duração.
    const saidaEstendida = matched ? estendeSaidaPorForaBase(matched, todasParadas) : null

    // Regra Tia Erica: quando a placa para várias vezes seguidas na MESMA loja
    // (mesmo codigo_loja, paradas CONSECUTIVAS na timeline — sem entregar em
    // outra loja entre elas), é a mesma entrega (mudou de portão/lado). Considera
    // chegada = PRIMEIRA do bloco, saída = ÚLTIMA do bloco. Se houver outra loja
    // entre as visitas (ex: Arraial 1→2→3→volta 1), o segundo bloco é entrega
    // separada e NÃO consolida.
    let chegadaFinal = matched ? new Date(matched.chegada) : null
    let saidaFinal: Date | null = saidaEstendida ?? (matched?.saida ? new Date(matched.saida) : null)
    if (matched && !isGeo && matched.codigo_loja) {
      const lojasOrdenadas = todasParadas
        .filter(p => p.classificacao === 'LOJA' && p.codigo_loja && p.saida)
        .sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
      const idxMatched = lojasOrdenadas.findIndex(p => p.id === matched.id)
      if (idxMatched >= 0) {
        let inicio = idxMatched
        for (let j = idxMatched - 1; j >= 0; j--) {
          if (lojasOrdenadas[j].codigo_loja !== matched.codigo_loja) break
          inicio = j
        }
        let fim = idxMatched
        for (let j = idxMatched + 1; j < lojasOrdenadas.length; j++) {
          if (lojasOrdenadas[j].codigo_loja !== matched.codigo_loja) break
          fim = j
        }
        if (inicio < idxMatched || fim > idxMatched) {
          chegadaFinal = new Date(lojasOrdenadas[inicio].chegada)
          const saidaBloco = new Date(lojasOrdenadas[fim].saida!)
          if (!saidaFinal || saidaBloco.getTime() > saidaFinal.getTime()) saidaFinal = saidaBloco
        }
      }
    }

    const paradas: ParadaKpi[] = matched
      ? [{
          parada_id: matched.id,
          loja_id: lojaId,
          nome: nomeResolvido,
          chegada: chegadaFinal!,
          saida: saidaFinal ?? chegadaFinal!,
          duracao_min: saidaFinal
            ? Math.round((saidaFinal.getTime() - chegadaFinal!.getTime()) / 60000)
            : Math.round((matched.duracao_seg ?? 0) / 60),
          classificacao: isGeo ? 'FORA_BASE' : 'LOJA',
        }]
      : []

    // Score: crossdock=0.7 (LOW + requiresReview), geo/plateTroca=0.8, trgm=score real, demais=1.0
    const metaScore = isCrossDock
      ? 0.7
      : (isGeo || isPlateTroca) ? 0.8 : metaAlgorithm === 'trgm'
      ? (trgmResults[linha.loja_nome_raw]?.trgm_score ?? 0.7)
      : 1.0

    // Confidence e requiresReview derivados do score real, não do algoritmo.
    // Antes: isGeo ? 'LOW' : 'HIGH' — trgm com score 0.62 recebia HIGH indevidamente.
    // Agora: HIGH se score >= 0.85, LOW se >= 0.6, UNMATCHED se < 0.6 (mas com parada).
    const metaConfidence: MatchConfidence = isGeo || isPlateTroca || metaScore < 0.85
      ? (metaScore >= 0.6 ? 'LOW' : 'UNMATCHED')
      : 'HIGH'
    const metaRequiresReview = metaScore < 0.75 || isPlateTroca

    rotas.push({
      escala_linha_id: linha.id,
      data: linha.data_entrega,
      rede_id: linha.rede_id,
      placa_norm: linha.placa_norm,
      saida_cd,
      paradas,
      anomalias_codigos: [],
      // 'sem_entrega' quando a placa aparece no unitrac mas não há parada operacional
      // correspondente — o veículo foi rastreado mas ficou na base ou não fez entrega
      // para esta loja. Distinto de 'pendente' (placa ausente do unitrac = sem GPS real).
      status: (!matched && todasParadas.length > 0) ? 'sem_entrega' : 'pendente',
      _matchMeta: matched
        ? { score: metaScore, confidence: metaConfidence, requiresReview: metaRequiresReview, algorithm: metaAlgorithm }
        : { score: 0, confidence: 'UNMATCHED', requiresReview: true, algorithm: 'none' },
    })
  }

  // ── Pós-processamento: match por geo/endereço de paradas FORA_BASE ──────────
  // Só roda com opts.geoEndereco. NÃO altera nenhum match já feito — apenas
  // preenche rotas que ficaram VAZIAS, casando uma parada FORA_BASE sem código à
  // LOJA QUE A PRÓPRIA LINHA espera, quando a coordenada bate o cadastro (≤100m,
  // ou 100–250m se a rua/bairro confirmar). Marca algorithm:'geo' + requiresReview.
  // Validado em dados reais (dia 20): rua-texto falha, coordenada casa limpo.
  if (opts?.geoEndereco) {
    const consumidas = new Set<string>()
    for (const r of rotas) for (const p of r.paradas) if (p.parada_id) consumidas.add(p.parada_id)

    const lojaEsperadaDaLinha = (linha: EscalaLinhaRow): LojaRow | null => {
      const fung = redesFungiveis(linha.rede_id)
      const cands = lojas.filter(l => fung.has(l.rede_id))
      if (linha.loja_codigo_raw) {
        const porCod = cands.find(l =>
          l.codigo_escala === linha.loja_codigo_raw ||
          (l.codigo_unitrac != null && codCasa(linha.loja_codigo_raw!, l.codigo_unitrac)))
        if (porCod) return porCod
      }
      return cands.find(l => matchScore(linha.loja_nome_raw, l.nome) === 0) ?? null
    }

    for (const rota of rotas) {
      if (rota.paradas.length > 0 || !rota.placa_norm) continue
      const linha = escalaLinhas.find(l => l.id === rota.escala_linha_id)
      if (!linha) continue
      const esperada = lojaEsperadaDaLinha(linha)
      if (!esperada || esperada.lat == null || esperada.lng == null) continue

      const candidatas = (paradaByPlaca.get(rota.placa_norm) ?? []).filter(p =>
        !consumidas.has(p.id) && p.lat != null && p.lng != null)

      let melhorP: UnitracParadaRow | null = null
      let melhorDist = Infinity
      // (1) FORA_BASE sem código casado por coordenada/endereço à loja agendada.
      for (const p of candidatas) {
        if (p.classificacao !== 'FORA_BASE' || p.codigo_loja) continue
        const m = matchGeoEndereco(
          { lat: p.lat, lng: p.lng, endereco: p.endereco ?? null, classificacao: p.classificacao, codigo_loja: p.codigo_loja },
          [{ id: esperada.id, rede_id: esperada.rede_id, nome: esperada.nome, lat: esperada.lat, lng: esperada.lng, endereco: esperada.endereco, bairro: esperada.bairro, municipio: esperada.municipio, numero: esperada.numero }],
        )
        if (m && m.distancia < melhorDist) { melhorDist = m.distancia; melhorP = p }
      }
      // (2) Loja DUPLICADA no cadastro: parada LOJA (código de uma loja-gêmea no
      //     mesmo ponto físico, ≤60m) que ficou órfã. Ex: escala casa "Iguaba (1
      //     Entrega)" 8590575 por nome, mas o GPS marca 8590570 "IGUABA GRANDE"
      //     (mesma loja, ~10m). Sem isso a entrega real some.
      if (!melhorP) {
        for (const p of candidatas) {
          if (p.classificacao !== 'LOJA') continue
          const d = haversine(p.lat!, p.lng!, esperada.lat, esperada.lng)
          if (d <= 60 && d < melhorDist) { melhorDist = d; melhorP = p }
        }
      }
      if (!melhorP) continue

      const chegada = new Date(melhorP.chegada)
      const saida = melhorP.saida ? new Date(melhorP.saida) : chegada
      rota.paradas = [{
        parada_id: melhorP.id,
        loja_id: esperada.id,
        nome: esperada.nome,
        chegada,
        saida,
        duracao_min: Math.round((saida.getTime() - chegada.getTime()) / 60000),
        classificacao: melhorP.classificacao === 'LOJA' ? 'LOJA' : 'FORA_BASE',
      }]
      // Saída do CD: última BASE BENASSI antes da parada geo (mesma regra do fluxo
      // normal). Sem isso, rotas casadas por geo saíam sem saida_cd no KPI.
      rota.saida_cd = computeSaidaCdParaParada(melhorP, paradaByPlaca.get(rota.placa_norm) ?? [], { redeId: rota.rede_id, data: rota.data })
      rota.status = 'ok'
      rota._matchMeta = { score: 0.7, confidence: 'LOW', requiresReview: true, algorithm: 'geo' }
      consumidas.add(melhorP.id)
    }
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
