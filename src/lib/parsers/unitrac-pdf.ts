// Parser do PDF do Unitrac (formato "Relatório Parada e Serviço, Analítico").
// Esse formato é o que a Érica usa hoje. Tem uma coluna a mais que o XLSX:
// "Local da Parada" — vem com a classificação pronta (BASE BENASSI, FORA DE
// BASE E LOCAL DE SERVIÇO, ou "código - nome da loja").
//
// Estratégia: extrai texto via pdf-parse (PDFParse class), divide em blocos
// por veículo (header com placa + resumo), e em cada bloco extrai paradas
// usando regex multilinha ancorado em lat/lng (estável).

import type { ParadaUnitrac, ResumoVeiculo } from '@/lib/types/unitrac'
import { corrigeOcrPlaca } from '@/lib/utils/placa'
import { isRotaGigante } from '@/lib/kpi/rotas-gigantes'
import { temLojaLocal, extraiLojaLocal } from './extrai-loja-local'

// pdf-parse v1.1.1 — default export é função (buf) => Promise<{text}>.
// v1 funciona em Node serverless sem depender de @napi-rs/canvas.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

const BASE_LOCAL_SHORT = 'BASE BENASSI'
const FORA_LOCAL_SHORT = 'FORA DE BASE'

function parseDataBR(s: string, hora: string): Date | null {
  // s = DD/MM/AAAA, hora = HH:MM
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const h = hora.match(/^(\d{2}):(\d{2})$/)
  if (!m || !h) return null
  const [, d, mo, y] = m
  const [, hh, mm] = h
  // Cria UTC (consistente com o resto do sistema que armazena tudo em UTC)
  return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, 0))
}

function parseDuracaoStr(s: string): number {
  // "0D 02:11:28"
  const m = s.match(/(\d+)D\s+(\d{1,2}):(\d{2}):(\d{2})/)
  if (!m) return 0
  return +m[1] * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4]
}

// Verifica se há uma parte LOJA real (com código numérico, fora ROTA/BASE/FORA)
// no local concatenado. Se houver, a parada é LOJA mesmo se a parte primária
// for BASE BENASSI (caminhão parou em raio sobreposto BASE+LOJA).
// Mesma semântica de findLojaGeofence no parser XLSX (unitrac.ts:120).
function temLojaConcatenada(local: string): boolean {
  const partes = local.split(',').map(s => s.trim())
  let viuBaseOuFora = false
  for (const p of partes) {
    if (p.startsWith(BASE_LOCAL_SHORT) || p.startsWith(FORA_LOCAL_SHORT)) { viuBaseOuFora = true; continue }
    if (ROTA_GENERICA_RE.test(p)) continue
    // temLojaLocal cobre "CÓDIGO - NOME" padrão e formatos com endereço
    // interposto ("CÓDIGO Cidade - UF NOME"). CEP "21530-900" não casa
    // (sem letra no nome após strip de endereço).
    if (!temLojaLocal(p)) continue
    // Rota gigante (geofence ≥ 5km, ex: "17659000 - O BOM ATACADISTA" 72km) que
    // aparece DEPOIS de um marcador BASE/FORA é sobreposição espúria — o caminhão
    // está na base e o geofence gigante só engloba a região. Não conta como loja.
    // Loja não-gigante após BASE continua contando (overlap real, ex: MERCADO X).
    const { codigo_loja } = extraiLojaLocal(p)
    if (viuBaseOuFora && isRotaGigante(codigo_loja)) continue
    return true
  }
  // Endereço COM vírgulas entre código e nome fragmenta a loja no split
  // ("8590573 26-40, NOVA CIDADE, ..., CEP 24804033 PRINCESA ITABORAÍ").
  // Tenta o local inteiro; exigePrefixoRede evita CEP no início virar código.
  if (!local.startsWith(BASE_LOCAL_SHORT) && !local.startsWith(FORA_LOCAL_SHORT)) {
    if (temLojaLocal(local, { exigePrefixoRede: true })) return true
  }
  return false
}

function classificaParada(local: string, duracaoSeg: number): ParadaUnitrac['classificacao'] {
  // Caminhão parado em raio sobreposto BASE/FORA + LOJA: sempre LOJA.
  // Antes, paradas com "BASE BENASSI, 23080000 - MERCADO X" viravam BASE
  // indevidamente (XLSX já tinha essa lógica via findLojaGeofence).
  if (temLojaConcatenada(local)) return 'LOJA'
  // BASE BENASSI / FORA DE BASE podem aparecer em QUALQUER ponto do local
  // (não só no início) quando há quebra de página no PDF que insere texto
  // do endereço entre os fragmentos. Procurar como substring é robusto.
  if (local.includes(BASE_LOCAL_SHORT)) return duracaoSeg > 900 ? 'BASE' : 'FAKE_EXIT'
  if (local.includes(FORA_LOCAL_SHORT)) return duracaoSeg < 600 ? 'FAKE_EXIT' : 'FORA_BASE'
  if (ehSoROTA(local)) {
    return duracaoSeg < 600 ? 'FAKE_EXIT' : 'FORA_BASE'
  }
  // Default: se não tem código de loja real (temLojaConcatenada=false) nem
  // marcadores BASE/FORA/ROTA, é FORA_BASE conservador. Antes retornava LOJA
  // por default, mas quebras de página produzem locais como "FORA DE DE JANEIRO"
  // (FORA DE BASE truncado) que viravam LOJA falsamente.
  // DIVERGE DE PROPÓSITO do parser XLSX (unitrac.ts:classificaParada), cujo default é
  // LOJA — lá o dado é limpo e estruturado; aqui é texto ruidoso de PDF. Não unificar
  // sem decisão de produto (Tia Erica). Ver nota equivalente no parser XLSX.
  return duracaoSeg < 600 ? 'FAKE_EXIT' : 'FORA_BASE'
}

// REDE_CODIGO_PREFIX_RE agora vive em extrai-loja-local.ts (fonte única).

// "12345 - ROTA ..." é geofence genérico de bairro/região (não loja física).
// Mesma regra do parser XLSX (unitrac.ts:123).
const ROTA_GENERICA_RE = /^\d+\s*-\s*ROTA\s/i

function extraiLoja(local: string): { codigo_loja: string | null; nome_loja: string | null } {
  // Limpa sufixo |VEHICLE_HEADER|<placa próx veículo> que vaza no last parada
  const cleaned = local.replace(/\s*\|VEHICLE_HEADER\|.*$/, '').trim()

  // Unitrac concatena várias lojas/zonas por vírgula quando o GPS cai no raio
  // de múltiplos locais. Extrai TODOS os pares "código - nome" e prefere o que
  // tem código com prefixo de rede conhecido (ex: 3030=SuperPrix, 5353=Prezunic).
  // Sem preferência clara, usa o primeiro par válido. ROTAS/BASE/FORA ignoradas.
  // Importante: NÃO descartamos cedo só porque começa com BASE — pode ter loja
  // real concatenada (ex: "BASE BENASSI, 23080000 - MERCADO X").
  const partes = cleaned.split(',').map(s => s.trim())

  // extraiLojaLocal cobre o formato padrão "CÓDIGO - NOME" (ancorado no início,
  // imune ao caso UFW0H63 dia 21 "CLIENTES ESPECIAIS - HERMES...") e os formatos
  // com endereço interposto ("CÓDIGO Cidade - UF NOME").
  // Preferência: 1ª loja NÃO-gigante vence; entre só-gigantes, a PRIMEIRA.
  // Partes com código mas SEM nome (fragmentos "8590573 26-40") não retornam
  // cedo — o local inteiro pode reconstituir o nome (ver abaixo).
  let fallbackGigante: { codigo_loja: string; nome_loja: string | null } | null = null
  let semNome: { codigo_loja: string; nome_loja: null } | null = null

  for (const parte of partes) {
    // Pula bases, foras e ROTAs genéricas
    if (parte.startsWith(BASE_LOCAL_SHORT) || parte.startsWith(FORA_LOCAL_SHORT)) continue
    if (ROTA_GENERICA_RE.test(parte)) continue
    const { codigo_loja: codigo, nome_loja: nome } = extraiLojaLocal(parte)
    if (!codigo) continue
    if (!nome) { if (!semNome) semNome = { codigo_loja: codigo, nome_loja: null }; continue }
    if (!isRotaGigante(codigo)) return { codigo_loja: codigo, nome_loja: nome }
    if (!fallbackGigante) fallbackGigante = { codigo_loja: codigo, nome_loja: nome }
  }

  if (fallbackGigante) return fallbackGigante

  // Endereço COM vírgulas entre código e nome fragmenta a loja no split.
  // Tenta o local inteiro pra reconstituir código+nome de uma vez.
  if (!cleaned.startsWith(BASE_LOCAL_SHORT) && !cleaned.startsWith(FORA_LOCAL_SHORT)) {
    const inteiro = extraiLojaLocal(cleaned, { exigePrefixoRede: true })
    if (inteiro.codigo_loja && inteiro.nome_loja) return inteiro
  }

  return semNome ?? { codigo_loja: null, nome_loja: null }
}

// Verifica se o `local_parada` é puramente uma geofence ROTA (sem loja real).
// Quando é só ROTA, a parada deve ser tratada como FORA_BASE (não LOJA).
function ehSoROTA(local: string): boolean {
  if (local.startsWith(BASE_LOCAL_SHORT) || local.startsWith(FORA_LOCAL_SHORT)) return false
  const partes = local.split(',').map(s => s.trim())
  // Se TODAS as partes são ROTAs ou vazias, é só ROTA
  return partes.length > 0 && partes.every(p => !p || ROTA_GENERICA_RE.test(p))
}

function computeSaidaCd(paradas: ParadaUnitrac[]): Date | null {
  // Localiza a primeira LOJA (destino real de entrega)
  const primeiraLojaIdx = paradas.findIndex(p => p.classificacao === 'LOJA')
  if (primeiraLojaIdx === -1) return null

  // Procura o último BASE antes da primeira LOJA.
  // O padrão antigo (retornar no 1º FORA_BASE) quebrava trucks com sequência
  // FORA_BASE → BASE → LOJA, que é comum quando o GPS já estava ligado antes
  // do caminhão entrar no pátio do CD.
  let lastBaseSaida: Date | null = null
  for (let i = 0; i < primeiraLojaIdx; i++) {
    const p = paradas[i]
    const isBase =
      p.classificacao === 'BASE' ||
      (p.classificacao === 'FAKE_EXIT' && p.local_parada.startsWith(BASE_LOCAL_SHORT))
    if (isBase) lastBaseSaida = p.saida
  }

  // Bug I1 (auditoria 2026-05-27): sem BASE antes da 1ª loja, NÃO usar a chegada na
  // loja como proxy — isso dava saida_cd = chegada_loja (viagem de 0 min, impossível).
  // O parser XLSX (unitrac.ts) já retorna null aqui; este gêmeo PDF tinha ficado pra
  // trás e o KPI definitivo (PDF) ainda mostrava a saída CD inflada. "Em branco honesto
  // > timestamp errado" (decisão da Tia Érica, vídeo 11/05).
  if (!lastBaseSaida) return null

  return lastBaseSaida
}

// pdf-parse v1 (pdfjs-dist v2) extrai texto SEM espaços entre fragmentos adjacentes
// — datas, horas, placas, coordenadas e palavras vêm grudadas. Esta função insere
// espaços nos limites conhecidos antes do parser regex.
function normalizeSpaces(raw: string): string {
  return raw
    // Cabeçalhos de coluna grudados (Veículo|Início Viagem|Fim Viagem|Qtd. Paradas)
    .replace(/Veículo(?=Início)/g, 'Veículo ')
    .replace(/Viagem(?=Fim|Qtd)/g, 'Viagem ')
    .replace(/Paradas(?=Distância|Tempo|Condutor)/g, 'Paradas ')
    // Placa (ABC-1234 ou ABC1D23) seguida de dígito (ex: AKZ-274515/05/2026)
    .replace(/([A-Z]{3}-?\d[A-Z0-9]\d{2})(\d)/g, '$1 $2')
    // Ano YYYY seguido de hora HH: (ex: 15/05/202604:38)
    .replace(/(\d{4})(\d{2}:\d{2})/g, '$1 $2')
    // Ano YYYY seguido de outra data DD/MM/YYYY (ex: 18/05/202618/05/2026)
    .replace(/(\d{4})(\d{2}\/\d{2}\/\d{4})/g, '$1 $2')
    // Ano YYYY seguido de duração "0D HH:MM:SS" (ex: 18/05/20260D 01:25:49)
    .replace(/(\d{4})(\d+D \d{2}:\d{2}:\d{2})/g, '$1 $2')
    // Hora HH:MM seguida de data DD/MM (ex: 04:3815/05/2026)
    .replace(/(\d{2}:\d{2})(\d{2}\/\d{2}\/\d{4})/g, '$1 $2')
    // Hora HH:MM seguida de número (ex: 14:30956 = "14:30" + "9" + "56")
    .replace(/(\d{2}:\d{2})(\d)/g, '$1 $2')
    // Duração 0D HH:MM:SS seguida de dígito
    .replace(/(\d+D \d{2}:\d{2}:\d{2})(\d)/g, '$1 $2')
    // Duração 0D HH:MM:SS seguida de letra (ex: "00:50:47Estr")
    .replace(/(\d+D \d{2}:\d{2}:\d{2})([A-ZÀ-Ýa-zà-ý])/g, '$1 $2')
    // Latitude seguida de longitude (-22.123-43.456)
    .replace(/(-?\d+\.\d+)(-\d+\.\d+)/g, '$1 $2')
    // Coordenada seguida de letra (ex: -43.341840BASE)
    .replace(/(-?\d+\.\d+)([A-Za-zÀ-Ýà-ý])/g, '$1 $2')
    // Letra seguida de coordenada negativa (ex: RJ-22.892950, "ão-22.910290")
    // Inclui minúsculas — palavras como "Sebastião", "Brasão", "Coração" terminam
    // em minúscula e ficam grudadas em coordenadas no PDF, devorando a próxima parada.
    .replace(/([A-Za-zÀ-Ýà-ý])(-\d+\.\d+)/g, '$1 $2')
    // Vírgula ou dígito (final de CEP) grudados em coordenada negativa
    // (ex: "COPACABANA,-22.983080", "22080010-22.983080")
    .replace(/([,.\d])(-\d{1,2}\.\d{4,6})/g, '$1 $2')
    // Lat/lng (exatamente 6 decimais) seguida de código numérico (ex: -43.5593609006154 = "-43.559360" + "9006154")
    .replace(/(-?\d+\.\d{6})(\d)/g, '$1 $2')
    // Número decimal seguido de "0D" (duração) — ex: "56,20D" = "56,2" + "0D"
    .replace(/(\d+,\d+)(0D )/g, '$1 $2')
}

// Limpa quebras de linha pra texto contínuo (mas preserva delimitadores chave)
function preprocess(raw: string): string {
  const normalized = normalizeSpaces(raw)
  let out = normalized
    // Remove "Página X de Y" e marcadores
    .replace(/Página \d+ de \d+/g, '')
    .replace(/-- \d+ of \d+ --/g, '')
    // Remove cabeçalhos repetidos de tabela
    .replace(/Condutor\s*Data parada\s*Data Saída[\s\S]*?Local da\s*Parada/g, '')
    // Remove cabeçalho do relatório CONSUMINDO a data/hora completa (pra não vazar "19/05/2026 00:00")
    .replace(/Relatório Parada e Serviço[\s\S]*?Data Fim:\s+\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/g, '')
    // Cabeçalho do bloco veículo (com ou sem espaços já inseridos)
    .replace(/Veículo\s+Início Viagem\s+Fim Viagem\s+Qtd\.\s*Paradas[\s\S]*?Cada Parada \(h\)/g, '|VEHICLE_HEADER|')

  // Repara paradas cortadas por quebra de página: PDF coloca dates sem HH:MM antes
  // da quebra, e os horários "HH:MM HH:MM" + parte do local_parada DEPOIS.
  // Reconstrói a sequência original: insere as horas entre as datas e concatena o
  // prefixo + sufixo do local_parada.
  // Padrão genérico: <date1> <date2> <campos até lat/lng> <prefix_local?> HH:MM HH:MM <suffix_local>
  const REPAIR = /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d+D \d{2}:\d{2}:\d{2}\s+\d+(?:[,.]\d+)?\s+\d+D \d{2}:\d{2}:\d{2}\s+[\s\S]+?-\d{1,2}\.\d{4,6}\s+-\d{1,3}\.\d{4,6})([\s\S]*?)\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+([\s\S]*?)(?=\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}|\|VEHICLE_HEADER\||$)/g
  out = out.replace(REPAIR, (_match, d1, d2, midFields, prefixLocal, h1, h2, suffixLocal) => {
    const prefix = String(prefixLocal).replace(/\s+/g, ' ').trim().replace(/\s*-\s*$/, '').trim()
    const suffix = String(suffixLocal).replace(/\s+/g, ' ').trim()
    const local = [prefix, suffix].filter(Boolean).join(' ').trim()
    return `${d1} ${h1} ${d2} ${h2} ${midFields} ${local} `
  })

  return out
}

type RawVeiculo = {
  placa: string
  inicio_viagem: Date | null
  fim_viagem: Date | null
  qtd_paradas: number
  rawText: string
}

function splitByVeiculo(text: string): RawVeiculo[] {
  // Cada veículo aparece como: |VEHICLE_HEADER| PLACA DATA HH:MM DATA HH:MM N X,Y 0D HH:MM:SS ...
  // Vou splitar por |VEHICLE_HEADER| e processar cada chunk
  const chunks = text.split('|VEHICLE_HEADER|').filter(c => c.trim())
  const out: RawVeiculo[] = []

  for (const chunk of chunks) {
    // Header de veículo: PLACA DATA HH:MM DATA HH:MM Qtd_paradas Distancia ...
    // Ex: AKZ-2745 14/05/2026 04:47 14/05/2026 17:29 10 59,4 0D 02:11:28 ...
    // Placa pode ter formato ABC-1234 ou ABC1234 (Mercosul)
    // qtd_paradas é seguido pela distância (formato "12 96,2") — ancorar com
    // lookahead de espaço+vírgula-numérica pra impedir captura grudada como
    // "12 96,2" → "1296,2" → qtd=1296. PDF cru às vezes gruda os dígitos.
    const headerMatch = chunk.match(
      /([A-Z]{3}-?\d[A-Z0-9]\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(\d{1,4})(?=\d{0,3}[,.]?\d|\s+\d)/,
    )
    if (!headerMatch) continue
    const [, placaRaw, dInicio, hInicio, dFim, hFim, qtdRaw] = headerMatch
    // Heurística: qtd_paradas raramente passa de 60. Se vier > 60, está grudado
    // com a distância (em km). Pega só os primeiros dígitos até qtd plausível.
    // PDF cru: "DD/MM/AAAA HH:MM N km,d 0D ..." — o N e km podem vir grudados.
    let qtdStr = qtdRaw
    while (qtdStr.length > 1 && parseInt(qtdStr, 10) > 60) qtdStr = qtdStr.slice(0, -1)
    out.push({
      placa: placaRaw,
      inicio_viagem: parseDataBR(dInicio, hInicio),
      fim_viagem: parseDataBR(dFim, hFim),
      qtd_paradas: parseInt(qtdStr, 10),
      rawText: chunk.slice(headerMatch.index! + headerMatch[0].length),
    })
  }
  return out
}

// Regex pra cada parada — ancorado em lat/lng (sempre presentes)
// Captura: chegada, saída, duração, distância, tempo_ate, endereço (greedy), lat, lng, local_parada (até próxima parada/fim)
const PARADA_REGEX = new RegExp(
  [
    String.raw`(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+`,                  // chegada
    String.raw`(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+`,                  // saída
    String.raw`(\d+D \d{2}:\d{2}:\d{2})\s+`,                               // duração (\d+D: aceita estacionamento multi-dia, >24h)
    String.raw`(\d+(?:[.,]\d+)?)\s+`,                                      // distância km
    String.raw`(\d+D \d{2}:\d{2}:\d{2})\s+`,                               // tempo até (\d+D: idem)
    String.raw`([\s\S]*?)\s+`,                                             // endereço (não-greedy)
    String.raw`(-\d{1,2}\.\d{4,6})\s+`,                                    // lat
    String.raw`(-\d{1,3}\.\d{4,6})\s+`,                                    // lng
    String.raw`([\s\S]*?)(?=\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}|$)`,      // local da parada (até próxima parada)
  ].join(''),
  'g',
)

function extractParadas(rawText: string, placaNorm: string): ParadaUnitrac[] {
  const paradas: ParadaUnitrac[] = []
  let ordem = 1
  PARADA_REGEX.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PARADA_REGEX.exec(rawText)) !== null) {
    const [, dCheg, hCheg, dSai, hSai, duracaoStr, distStr, , enderecoRaw, latStr, lngStr, localRaw] = m
    const chegada = parseDataBR(dCheg, hCheg)
    const saida = parseDataBR(dSai, hSai)
    if (!chegada || !saida) continue

    const duracao_seg = parseDuracaoStr(duracaoStr)
    const distancia_km = parseFloat(distStr.replace(',', '.'))
    const lat = parseFloat(latStr)
    const lng = parseFloat(lngStr)

    const endereco = enderecoRaw.trim().replace(/\s+/g, ' ').trim() || null
    const local_parada = localRaw.trim().replace(/\s+/g, ' ').trim() || ''

    const classificacao = classificaParada(local_parada, duracao_seg)
    const { codigo_loja, nome_loja } = extraiLoja(local_parada)

    paradas.push({
      placa_norm: placaNorm,
      chegada,
      saida,
      duracao_seg,
      distancia_km: isNaN(distancia_km) ? null : distancia_km,
      endereco,
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng,
      local_parada,
      codigo_loja,
      nome_loja,
      classificacao,
      ordem: ordem++,
    } as ParadaUnitrac)
  }
  return paradas
}

/**
 * `cadastroPlacas`: conjunto opcional de placas-norm conhecidas (fonte limpa, ex:
 * histórico de `unitrac_paradas` do banco, alimentado por uploads XLSX que não
 * sofrem OCR). Quando passado, a placa parseada do PDF é validada contra ele:
 * se a forma OCR-confusada (pos-4 ∈ {B,E,G,H,I,J,O,S,Z}) NÃO existe no cadastro
 * mas a variante antiga existe, usa a antiga. Evita over-correction sem cadastro.
 *
 * Bug HLOG (2026-05-20): PDFs do HLOG retornam pos-4 letra OCR-confusa onde a
 * placa real é antiga (ex: LCO-0978 vira LCO-0J78). Sem cadastro o parser não
 * tem como saber qual interpretação é correta, então mantemos o que veio.
 */
export function parseTextToResumos(
  rawText: string,
  cadastroPlacas?: ReadonlySet<string> | null,
): ResumoVeiculo[] {
  const cleaned = preprocess(rawText)
  const rawVeiculos = splitByVeiculo(cleaned)

  const out: ResumoVeiculo[] = []
  for (const rv of rawVeiculos) {
    const placaNorm = corrigeOcrPlaca(rv.placa, cadastroPlacas)
    if (!placaNorm) continue
    const paradas = extractParadas(rv.rawText, placaNorm)
    if (paradas.length === 0) continue

    const saida_cd = computeSaidaCd(paradas)
    out.push({
      placa_norm: placaNorm,
      placa_raw: rv.placa,
      inicio_viagem: rv.inicio_viagem,
      fim_viagem: rv.fim_viagem,
      qtd_paradas: rv.qtd_paradas,
      saida_cd,
      paradas,
    } as ResumoVeiculo)
  }
  return out
}

export async function parseUnitracPdf(
  buffer: ArrayBuffer | Buffer,
  cadastroPlacas?: ReadonlySet<string> | null,
): Promise<ResumoVeiculo[]> {
  const USE_PDFJS = process.env.PDF_PARSER_BACKEND === 'pdfjs-serverless'
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer

  if (USE_PDFJS) {
    const { parseUnitracPdfJs } = await import('./unitrac-pdf-pdfjs')
    return parseUnitracPdfJs(buf, cadastroPlacas)
  }

  const result = await pdfParse(buf)

  if (process.env.PDF_SHADOW_MODE === 'true') {
    import('./unitrac-pdf-pdfjs').then(({ parseUnitracPdfJs }) =>
      parseUnitracPdfJs(buf, cadastroPlacas).then(shadow => {
        const original = parseTextToResumos(result.text, cadastroPlacas)
        if (original.length !== shadow.length)
          console.log(`[pdf-shadow] mismatch: orig=${original.length} pdfjs=${shadow.length}`)
      }).catch(() => {})
    )
  }

  return parseTextToResumos(result.text, cadastroPlacas)
}
