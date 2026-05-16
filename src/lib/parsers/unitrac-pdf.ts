// Parser do PDF do Unitrac (formato "Relatório Parada e Serviço, Analítico").
// Esse formato é o que a Érica usa hoje. Tem uma coluna a mais que o XLSX:
// "Local da Parada" — vem com a classificação pronta (BASE BENASSI, FORA DE
// BASE E LOCAL DE SERVIÇO, ou "código - nome da loja").
//
// Estratégia: extrai texto via pdf-parse (PDFParse class), divide em blocos
// por veículo (header com placa + resumo), e em cada bloco extrai paradas
// usando regex multilinha ancorado em lat/lng (estável).

import type { ParadaUnitrac, ResumoVeiculo } from '@/lib/types/unitrac'
import { normalizaPlaca } from '@/lib/utils/placa'

// pdf-parse v1.1.1 — default export é função (buf) => Promise<{text}>.
// v1 funciona em Node serverless sem depender de @napi-rs/canvas.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

const BASE_LOCAL = 'BASE BENASSI - BASE BENASSI'
const FORA_LOCAL = 'FORA DE BASE E LOCAL DE SERVIÇO'

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

function classificaParada(local: string, duracaoSeg: number): ParadaUnitrac['classificacao'] {
  if (local === BASE_LOCAL) return duracaoSeg > 900 ? 'BASE' : 'FAKE_EXIT'
  if (local === FORA_LOCAL) return duracaoSeg < 600 ? 'FAKE_EXIT' : 'FORA_BASE'
  return 'LOJA'
}

function extraiLoja(local: string): { codigo_loja: string | null; nome_loja: string | null } {
  // codigo_loja/nome_loja só fazem sentido pra LOJA real (formato "12345 - NOME")
  // BASE BENASSI e FORA DE BASE não tem código numérico
  if (local === BASE_LOCAL || local === FORA_LOCAL) {
    return { codigo_loja: null, nome_loja: null }
  }
  const idx = local.indexOf(' - ')
  if (idx === -1) return { codigo_loja: null, nome_loja: null }
  const codigo = local.slice(0, idx).trim()
  // Codigo de loja real é numérico. Se vier texto (ex: "BASE BENASSI"), ignora.
  if (!/^\d+$/.test(codigo)) return { codigo_loja: null, nome_loja: null }
  const nome = local.slice(idx + 3).trim() || null
  return { codigo_loja: codigo, nome_loja: nome }
}

function computeSaidaCd(paradas: ParadaUnitrac[]): Date | null {
  let lastBaseSaida: Date | null = null
  for (const p of paradas) {
    if (p.classificacao === 'FAKE_EXIT') continue
    if (p.classificacao === 'BASE') {
      lastBaseSaida = p.saida
    } else {
      return lastBaseSaida
    }
  }
  return null
}

// Limpa quebras de linha pra texto contínuo (mas preserva delimitadores chave)
function preprocess(raw: string): string {
  return raw
    // Remove "Página X de Y" e marcadores
    .replace(/Página \d+ de \d+/g, '')
    .replace(/-- \d+ of \d+ --/g, '')
    // Remove cabeçalhos repetidos de tabela
    .replace(/Condutor Data parada Data Saída Duração\s+Parada[\s\S]*?Local da\s+Parada/g, '')
    .replace(/Relatório Parada e Serviço\s+Data Inicio:.*?\s+Data Fim:.*?(?=\s)/g, '')
    .replace(/Veículo Início Viagem Fim Viagem Qtd\. Paradas[\s\S]*?Cada Parada \(h\)/g, '|VEHICLE_HEADER|')
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
    const headerMatch = chunk.match(
      /([A-Z]{3}-?\d[A-Z0-9]\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(\d+)/,
    )
    if (!headerMatch) continue
    const [, placaRaw, dInicio, hInicio, dFim, hFim, qtdStr] = headerMatch
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
    String.raw`(0D \d{2}:\d{2}:\d{2})\s+`,                                 // duração
    String.raw`(\d+(?:[.,]\d+)?)\s+`,                                      // distância km
    String.raw`(0D \d{2}:\d{2}:\d{2})\s+`,                                 // tempo até
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

export async function parseUnitracPdf(
  buffer: ArrayBuffer | Buffer,
): Promise<ResumoVeiculo[]> {
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  const result = await pdfParse(buf)
  const fullText = result.text

  const cleaned = preprocess(fullText)
  const rawVeiculos = splitByVeiculo(cleaned)

  const out: ResumoVeiculo[] = []
  for (const rv of rawVeiculos) {
    const placaNorm = normalizaPlaca(rv.placa)
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
