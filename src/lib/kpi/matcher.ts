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
            mesmaLoja = true
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
      localStr.includes('BASE BENASSI')
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

// Gera variantes da placa com 1 substituição OCR (até 1 char diferente).
// Limita à posição 4 (zero-indexed) que é onde Mercosul muda de dígito pra letra.
export function variantesOcr(placa: string): string[] {
  if (placa.length !== 7) return [placa]
  const variantes = new Set([placa])
  const ch = placa[4]
  const subs = OCR_PARES[ch]
  if (subs) for (const sub of subs) variantes.add(placa.slice(0, 4) + sub + placa.slice(5))
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
): Map<string, UnitracParadaRow> {
  const result = new Map<string, UnitracParadaRow>()
  if (!linhas.length || !paradas.length) return result

  const ls = [...linhas].sort((a, b) => a.loja_nome_raw.localeCompare(b.loja_nome_raw))
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
  const scoreComRede = (l: EscalaLinhaRow, p: UnitracParadaRow): number => {
    const base = scorePair(l, p)
    if (base === Infinity) return Infinity
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
    const todasAjustadas: typeof todas = todas.map(p => {
      if (p.classificacao !== 'LOJA') return p
      if (!p.codigo_loja || p.lat == null || p.lng == null) return p
      const lojaCad = lojas.find(l => l.codigo_unitrac === p.codigo_loja)
      if (!lojaCad?.lat || !lojaCad?.lng) return p
      const d = haversine(p.lat, p.lng, lojaCad.lat, lojaCad.lng)
      if (d > 500) {
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
    const assigned = assignOptimal(linhas, lojasParadas, paradaRedes)
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
          // T12: Rede fallback agora SÓ aceita paradas SEM rede identificada (coringa).
          // Antes aceitava também parada com rede igual à da escala (redes.has(linha.rede_id)),
          // o que produzia falso positivo "rede certa, loja errada". Ex KUL1425:
          // escala PREZUNIC PECHINCHA, parada cadastrada PREZUNIC VILA ISABEL (loja
          // física DIFERENTE, sem tokens em comum). Sem T12, o `redes.has(PREZUNIC)`
          // aceitava e o KPI saía com horários da loja errada — pior que UNMATCHED.
          // Agora: só parada não-identificada (redes.size === 0) entra como coringa.
          if (linhasOrdenadas.length === 1 && redes.size === 0) {
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
      const paradasForaBase = todasAjustadas
        .filter(p =>
          // Inclui FAKE_EXIT também: lojas com geofence ausente no Unitrac ficam como
          // FAKE_EXIT quando duração curta. Caso REGINA 1 DE MAIO dia 19: parada 14:20
          // (7min) é entrega rápida em -22.4133, mas Unitrac classifica FAKE_EXIT
          // porque cadastro Unitrac não tem geofence REGINA. Geo fallback aqui usa
          // coord da loja CADASTRADA pra fazer match independente do parser Unitrac.
          (p.classificacao === 'FORA_BASE' || p.classificacao === 'FAKE_EXIT') &&
          p.lat != null && p.lng != null &&
          !usados.has(p.id) &&
          // Exclui paradas antes das 03:00 BRT — veículo estacionado perto da loja
          // durante a madrugada não é entrega. T18-N usa 07:00; geo usa 03:00 (mesma
          // lógica do filtrarParadaNocturnaSolitaria) pois algumas entregas reais
          // começam às 04:00-05:00.
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
      // Usa todasAjustadas (não todas) — paradas reclassificadas como FORA_BASE pelo T20
      // não devem contar como LOJA órfã. Caso ARMAZEM dia 20: paradas LOJA cod 5353012
      // erroneamente classificadas em BASE/Maricá vão pra FORA_BASE e ficam livres
      // pra geo fallback, sem bloquear o resto.
      const temLojaOrfaMesmaRede = todasAjustadas.some(p => {
        if (p.classificacao !== 'LOJA' || usados.has(p.id)) return false
        // Infere rede da parada órfã
        for (const r of redesSemMatch) {
          if (resolveLojaId(p, lojas, r)) return true
        }
        return false
      })

      // Geo-R: pula se LOJA órfã é da mesma rede da linha (FP cross-rede); permite
      // se órfã é de outra rede (motorista fez multi-cliente).
      if (!temLojaOrfaMesmaRede) {
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

          // Fallback canonical_loja se nenhuma loja da rede bateu por geo+nome
          if (!atribuido && (geoStores ?? []).length > 0) {
            const bateCanonical = resolveForaBaseGeo(p.lat!, p.lng!, geoStores!)
            if (bateCanonical) {
              // sem amarração de loja específica: atribui à primeira linha sem match
              // (comportamento legacy preservado pra canonical, onde rede pode não existir)
              const linhaAlvo = linhasAindaSemMatch.find(l => !matchByEscalaId.has(l.id))
              if (linhaAlvo) {
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
        const lojaCad = lojas.find(l => {
          if (l.rede_id !== linha.rede_id) return false
          if (linha.loja_codigo_raw && l.codigo_escala === linha.loja_codigo_raw) return true
          return matchScore(linha.loja_nome_raw, l.nome) <= 1
        })
        const compartilhada = paradasUsadasNaPlaca.find(p => {
          if (scorePair(linha, p) !== 0) return false
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
      const paradaRedeInfer = new Map<string, string | null>()
      for (const p of paradasLojaLivres) {
        let redeInf: string | null = null
        for (const r of redesPresentes) {
          if (resolveLojaId(p, lojas, r)) { redeInf = r; break }
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
            matchByEscalaId.set(linhasOrd[i].id, paradasOrd[i])
            usados.add(paradasOrd[i].id)
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
            // Reusa paradas — se há mais linhas que paradas, a última é repetida.
            const parada = paradasOrd[Math.min(i, paradasOrd.length - 1)]
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
      const placaRes = resolvePlacaUnitrac(l.placa_norm)
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
        // Tenta encontrar a loja no cadastro para usar GPS como fallback
        const lojaEscala = lojas.find(l => {
          if (l.rede_id !== linha.rede_id) return false
          if (linha.loja_codigo_raw && l.codigo_escala === linha.loja_codigo_raw) return true
          return matchScore(linha.loja_nome_raw, l.nome) <= 1
        })
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
            // Exige match próximo (≤ 2 tokens de diferença) — evita FP por tokens genéricos
            // como "BARRA" ou "LOJA" que aparecem em múltiplas lojas diferentes.
            return scorePair(linha, p) <= 2
          }
          // Coringa (sem rede): exige score ≤ 2 — geo fallback removido para evitar FP
          // de paradas de outras cadeias geograficamente próximas (ex: Guanabara Barra).
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
