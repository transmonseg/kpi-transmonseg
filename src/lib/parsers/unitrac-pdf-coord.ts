/**
 * EXPERIMENTAL — não usar em produção. Mantido para evolução futura.
 *
 * Parser PDF Unitrac robusto baseado em COORDENADAS X/Y dos itens de texto.
 *
 * Por que esse parser existe:
 *   O parser anterior (`unitrac-pdf.ts`) usa regex no texto cru extraído com
 *   `pdf-parse`. Cada bug do PDF (token grudado, quebra de página estranha,
 *   coordenada colada em vírgula, palavra com minúscula antes da coord, etc.)
 *   exigia uma nova regra de normalização. Frágil — sempre aparecia caso novo.
 *
 * Estratégia deste parser:
 *   Em vez de processar texto plano, agrupa itens pelo Y (mesma linha visual)
 *   e detecta colunas por X. Resiliente a:
 *     - Quebras de página (cada página tem mesmo layout)
 *     - Tokens grudados (cada item PDF preserva seu próprio X)
 *     - Texto truncado (lê os fragmentos sem assumir contiguidade)
 *
 * O Unitrac tem layout de tabela com colunas em X fixos por página:
 *   Col 0 (X ~50):   Data parada / Data Saída (DD/MM/AAAA + HH:MM em 2 linhas)
 *   Col 1 (X ~165):  Duração (0D HH:MM:SS)
 *   Col 2 (X ~225):  Distância (km)
 *   Col 3 (X ~270):  Tempo Até o Local
 *   Col 4 (X ~340):  Endereço (texto longo, multi-linha)
 *   Col 5 (X ~530):  Latitude
 *   Col 6 (X ~575):  Longitude
 *   Col 7 (X ~620):  Local da Parada (multi-linha, à direita)
 *
 * Header de veículo (linha completa, em X ~50):
 *   "PLACA DATA HH:MM DATA HH:MM N km 0D HH:MM:SS 0D HH:MM:SS 0D HH:MM:SS"
 */
import { getDocument } from 'pdfjs-serverless'
import type { ParadaUnitrac, ResumoVeiculo } from '@/lib/types/unitrac'
import { normalizaPlaca } from '@/lib/utils/placa'

interface PdfItem {
  str: string
  x: number
  y: number
  width: number
  page: number
}

interface LinhaVisual {
  y: number
  page: number
  items: PdfItem[]
}

/**
 * Agrupa itens PDF por linha visual (Y aproximado).
 * Itens com Y dentro de TOL pixels são considerados na mesma linha.
 */
function agruparPorLinha(items: PdfItem[], tol = 3): LinhaVisual[] {
  const sorted = [...items].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    if (Math.abs(a.y - b.y) > tol) return b.y - a.y // PDF Y cresce pra cima
    return a.x - b.x
  })
  const linhas: LinhaVisual[] = []
  for (const it of sorted) {
    const last = linhas[linhas.length - 1]
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= tol) {
      last.items.push(it)
    } else {
      linhas.push({ y: it.y, page: it.page, items: [it] })
    }
  }
  return linhas
}

/**
 * Extrai todos os items do PDF com coordenadas preservadas.
 */
async function extractItems(buffer: Buffer): Promise<PdfItem[]> {
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
  const items: PdfItem[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const it = item as { str: string; transform: number[]; width: number }
      if (!it.str.trim()) continue
      // transform[4] = x, transform[5] = y
      items.push({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        width: it.width ?? 0,
        page: p,
      })
    }
  }
  return items
}

const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/
const TIME_RE = /^(\d{2}):(\d{2})$/
const DUR_RE = /^0D\s*(\d{2}):(\d{2}):(\d{2})$/
const LATLNG_RE = /^-\d{1,2}\.\d{4,6}$/
const PLACA_RE = /^([A-Z]{3}-?\d[A-Z0-9]\d{2})$/

function parseDateBR(s: string): { y: number; m: number; d: number } | null {
  const m = s.match(DATE_RE)
  if (!m) return null
  return { d: +m[1], m: +m[2], y: +m[3] }
}
function parseHHMM(s: string): { hh: number; mm: number } | null {
  const m = s.match(TIME_RE)
  if (!m) return null
  return { hh: +m[1], mm: +m[2] }
}
function parseDur(s: string): number {
  const m = s.match(DUR_RE)
  if (!m) return 0
  return +m[1] * 3600 + +m[2] * 60 + +m[3]
}

/**
 * Reconstrói data+hora a partir de tokens dispersos numa "célula" de coluna:
 * geralmente vem como [DATA, HORA, DATA, HORA] (data parada, data saída).
 * Retorna [chegada, saida] como Date BR-mascarado-UTC.
 */
function reconstruirDatas(tokens: string[]): { chegada: Date | null; saida: Date | null } {
  let dataCheg: { y:number; m:number; d:number } | null = null
  let horaCheg: { hh:number; mm:number } | null = null
  let dataSai: { y:number; m:number; d:number } | null = null
  let horaSai: { hh:number; mm:number } | null = null

  for (const t of tokens) {
    const dt = parseDateBR(t)
    if (dt) {
      if (!dataCheg) dataCheg = dt
      else if (!dataSai) dataSai = dt
      continue
    }
    const hr = parseHHMM(t)
    if (hr) {
      if (!horaCheg) horaCheg = hr
      else if (!horaSai) horaSai = hr
    }
  }
  if (!dataCheg || !horaCheg) return { chegada: null, saida: null }
  const chegada = new Date(Date.UTC(dataCheg.y, dataCheg.m - 1, dataCheg.d, horaCheg.hh, horaCheg.mm, 0))
  let saida: Date | null = null
  if (dataSai && horaSai) {
    saida = new Date(Date.UTC(dataSai.y, dataSai.m - 1, dataSai.d, horaSai.hh, horaSai.mm, 0))
  }
  return { chegada, saida }
}

const BASE_LOCAL_SHORT = 'BASE BENASSI'
const FORA_LOCAL_SHORT = 'FORA DE BASE'

function classificaParada(local: string, duracaoSeg: number): ParadaUnitrac['classificacao'] {
  if (local.includes(BASE_LOCAL_SHORT)) {
    return duracaoSeg > 900 ? 'BASE' : 'FAKE_EXIT'
  }
  if (local.includes(FORA_LOCAL_SHORT)) {
    return duracaoSeg < 600 ? 'FAKE_EXIT' : 'FORA_BASE'
  }
  // "12345 - ROTA X" é geofence genérica de bairro
  if (/^\d+\s*-\s*ROTA\s/i.test(local)) {
    return duracaoSeg < 600 ? 'FAKE_EXIT' : 'FORA_BASE'
  }
  // Loja real = "código - texto com letra"
  if (/^\d+\s*-\s*.*[A-Za-zÀ-Ýà-ý]/.test(local)) return 'LOJA'
  return duracaoSeg < 600 ? 'FAKE_EXIT' : 'FORA_BASE'
}

function extraiLoja(local: string): { codigo_loja: string | null; nome_loja: string | null } {
  if (local.startsWith(BASE_LOCAL_SHORT) || local.startsWith(FORA_LOCAL_SHORT)) {
    return { codigo_loja: null, nome_loja: null }
  }
  for (const parte of local.split(',').map(s => s.trim())) {
    if (parte.startsWith(BASE_LOCAL_SHORT) || parte.startsWith(FORA_LOCAL_SHORT)) continue
    if (/^\d+\s*-\s*ROTA\s/i.test(parte)) continue
    const m = parte.match(/^(\d+)\s+-\s+(.+)$/)
    if (!m) continue
    if (!/[A-Za-zÀ-Ýà-ý]/.test(parte)) continue
    return { codigo_loja: m[1], nome_loja: m[2].trim() }
  }
  return { codigo_loja: null, nome_loja: null }
}

/**
 * Parser principal. Detecta blocos de veículos e suas paradas pelo layout visual.
 *
 * Estratégia:
 *  1. Agrupa items por linha visual (mesma Y).
 *  2. Identifica linhas que são "header de veículo" (placa + datas + km + durações).
 *  3. Cada bloco entre 2 headers é "paradas desse veículo".
 *  4. Pra cada parada, extrai datas/horas, lat/lng e local agrupando por colunas X.
 */
export async function parseUnitracPdfRobust(
  buffer: Buffer,
  _cadastroPlacas?: ReadonlySet<string> | null,
): Promise<ResumoVeiculo[]> {
  if (buffer.length === 0) return []
  const items = await extractItems(buffer)
  const linhas = agruparPorLinha(items)

  // Identifica headers de veículo: linha contendo um item-placa.
  const idxsHeader: number[] = []
  for (let i = 0; i < linhas.length; i++) {
    const tokens = linhas[i].items.map(it => it.str.trim())
    if (tokens.some(t => PLACA_RE.test(t.replace(/[\s]/g, '')))) idxsHeader.push(i)
  }

  const resumos: ResumoVeiculo[] = []
  for (let h = 0; h < idxsHeader.length; h++) {
    const headerIdx = idxsHeader[h]
    const proxIdx = h + 1 < idxsHeader.length ? idxsHeader[h + 1] : linhas.length
    const headerLinha = linhas[headerIdx]
    const headerTokens = headerLinha.items.map(it => it.str.trim())

    const placaRaw = headerTokens.find(t => PLACA_RE.test(t.replace(/\s/g, ''))) ?? ''
    const placaNorm = normalizaPlaca(placaRaw)
    if (!placaNorm) continue

    // Datas do header (início viagem / fim viagem)
    const headerDatas = reconstruirDatas(headerTokens)

    // Extrai paradas usando ranges de Y.
    // Cada parada começa numa linha que tem DD/MM/YYYY na col esquerda (X<150).
    // O range Y de uma parada vai de seu Y_topo até o Y_topo da próxima parada
    // (exclusive). Items dentro desse range pertencem a essa parada.
    // PDF tem Y crescente pra cima — paradas em ordem decrescente de Y.
    const linhasDoVeiculo = linhas.slice(headerIdx + 1, proxIdx)
    const inicioParadas: LinhaVisual[] = []
    for (const ln of linhasDoVeiculo) {
      // Linha-início = tem item com data na primeira coluna (X<150)
      const temDataEsquerda = ln.items.some(it => it.x < 150 && DATE_RE.test(it.str.trim()))
      if (temDataEsquerda) inicioParadas.push(ln)
    }

    const paradas: ParadaUnitrac[] = []
    let ordem = 1

    for (let pi = 0; pi < inicioParadas.length; pi++) {
      const ln = inicioParadas[pi]
      const yTopo = ln.y
      const yBase = pi + 1 < inicioParadas.length ? inicioParadas[pi + 1].y : -Infinity

      // Coleta TODOS os items entre yBase (exclusive) e yTopo (inclusive) NA MESMA PÁGINA.
      // Itens em página seguinte só entram se for continuação direta (Local da Parada
      // pode vazar — mas só consideramos a mesma página por agora).
      const itensDaParada = linhasDoVeiculo
        .filter(l => l.page === ln.page && l.y <= yTopo && l.y > yBase)
        .flatMap(l => l.items)

      const tokens = itensDaParada.map(it => it.str.trim())
      const { chegada, saida } = reconstruirDatas(tokens)
      if (!chegada) continue

      // Duração: primeiro 0D HH:MM:SS
      const dur = tokens.map(parseDur).find(v => v > 0) ?? 0

      // Distância: número decimal isolado (XX,X) que não seja coordenada
      let distKm = 0
      for (const t of tokens) {
        if (/^-?\d+\.\d{4,}$/.test(t)) continue
        const m = t.match(/^(\d+[,.]\d+)$/)
        if (m) { distKm = parseFloat(m[1].replace(',', '.')); break }
      }

      // Lat/Lng: primeiros 2 itens que casam coord
      const coords = tokens.filter(t => LATLNG_RE.test(t))
      const lat = coords.length >= 2 ? parseFloat(coords[0]) : null
      const lng = coords.length >= 2 ? parseFloat(coords[1]) : null

      // Local da Parada: items com X >= 510 (coluna direita do PDF).
      const itemsLocal = itensDaParada.filter(it => it.x >= 510)
      const localRaw = itemsLocal.map(it => it.str.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
      const local = localRaw
        .replace(/Local\s+da\s+Parada/gi, '')
        .replace(/CondutorData paradaData Sa.da/gi, '')
        .trim()

      // Endereço: X entre 290 e 425
      const enderecoItems = itensDaParada.filter(it => it.x >= 290 && it.x < 425)
      const endereco = enderecoItems.map(it => it.str.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || null

      const classif = classificaParada(local, dur)
      const { codigo_loja, nome_loja } = extraiLoja(local)

      paradas.push({
        placa_norm: placaNorm,
        chegada,
        saida,
        duracao_seg: dur,
        distancia_km: distKm > 0 ? distKm : null,
        endereco,
        lat,
        lng,
        local_parada: local,
        codigo_loja,
        nome_loja,
        classificacao: classif,
        ordem: ordem++,
      } as ParadaUnitrac)
    }

    resumos.push({
      placa_norm: placaNorm,
      placa_raw: placaRaw,
      inicio_viagem: headerDatas.chegada,
      fim_viagem: headerDatas.saida,
      qtd_paradas: paradas.length,
      saida_cd: null,
      paradas,
    } as ResumoVeiculo)
  }

  return resumos
}
