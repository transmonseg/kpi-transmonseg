// Parser da Escala de Rota do Nutrimax (PDF "8081 - Escala de Rota").
//
// `pdf-parse` (usado no parser do Romaneio) trava com "Illegal character: 41"
// nesse PDF especificamente — então aqui usamos `pdfjs-serverless` direto,
// preservando as coordenadas X/Y de cada fragmento de texto (mesma técnica
// de `unitrac-pdf-coord.ts`). Colunas identificadas por faixa de X porque o
// PDF às vezes gruda células adjacentes num único item de texto (ex: "NF" e
// "MOTORISTA" viram "38 ALEXSANDRO CARDOSO VALENTE") e às vezes não — layout
// muda com o tamanho do conteúdo da célula (peso baixo separa mais).
import { getDocument } from 'pdfjs-serverless'
import type { LinhaEscalaNutrimax } from './types'

export type ItemTexto = { str: string; x: number }
type ItemComLinha = ItemTexto & { y: number; page: number }
type LinhaVisual = { y: number; page: number; items: ItemTexto[] }

const CARGA_RE = /^\d{4,6}$/
const PLACA_RE = /([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4})$/
const NF_MOTORISTA_RE = /^(\d+)\s+(.+)$/

function itensEmFaixa(items: ItemTexto[], min: number, max: number): ItemTexto[] {
  return items.filter(it => it.x >= min && it.x < max).sort((a, b) => a.x - b.x)
}

function textoEmFaixa(items: ItemTexto[], min: number, max: number): string {
  return itensEmFaixa(items, min, max).map(it => it.str.trim()).filter(Boolean).join(' ').trim()
}

function normalizaPlaca(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Parser puro — recebe os itens de UMA linha visual (já agrupados por Y) e
 * devolve a linha da escala, ou null se a linha não for de dado (cabeçalho,
 * rodapé de comboio, título).
 */
export function linhaParaEscala(items: ItemTexto[]): LinhaEscalaNutrimax | null {
  const cargaItem = itensEmFaixa(items, 8, 28)[0]
  if (!cargaItem || !CARGA_RE.test(cargaItem.str.trim())) return null

  const veiculoRaw = textoEmFaixa(items, 35, 60)
  const placaM = veiculoRaw.match(PLACA_RE)
  if (!placaM) return null
  const placaRaw = placaM[1].trim()

  const destino = textoEmFaixa(items, 85, 145)
  const pesoRaw = itensEmFaixa(items, 188, 216)[0]?.str.trim() ?? null
  const entRaw = itensEmFaixa(items, 216, 231)[0]?.str.trim() ?? null
  const nfMotoristaRaw = textoEmFaixa(items, 231, 398)
  const ajudante1 = textoEmFaixa(items, 398, 558) || null
  const ajudante2 = textoEmFaixa(items, 558, 715) || null

  const nfM = nfMotoristaRaw.match(NF_MOTORISTA_RE)
  const nfPlanejado = nfM ? parseInt(nfM[1], 10) : null
  const motorista = nfM ? nfM[2].trim() : nfMotoristaRaw

  return {
    carga: cargaItem.str.trim(),
    placaRaw,
    placaNorm: normalizaPlaca(placaRaw),
    destino,
    motorista,
    ajudante1,
    ajudante2,
    pesoKg: pesoRaw ? parseInt(pesoRaw.replace(/\./g, ''), 10) : null,
    entPlanejado: entRaw ? parseInt(entRaw, 10) : null,
    nfPlanejado,
  }
}

function agruparPorLinha(items: ItemComLinha[], tol = 3): LinhaVisual[] {
  const sorted = [...items].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    if (Math.abs(a.y - b.y) > tol) return b.y - a.y
    return a.x - b.x
  })
  const linhas: LinhaVisual[] = []
  for (const it of sorted) {
    const last = linhas[linhas.length - 1]
    if (last && it.page === last.page && Math.abs(last.y - it.y) <= tol) {
      last.items.push(it)
    } else {
      linhas.push({ y: it.y, page: it.page, items: [it] })
    }
  }
  return linhas
}

export async function parseEscalaNutrimax(buffer: Buffer): Promise<LinhaEscalaNutrimax[]> {
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
  const items: ItemComLinha[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const it = item as { str: string; transform: number[] }
      if (!it.str.trim()) continue
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], page: p })
    }
  }

  const linhas = agruparPorLinha(items)
  const resultado: LinhaEscalaNutrimax[] = []
  for (const linha of linhas) {
    const parsed = linhaParaEscala(linha.items)
    if (parsed) resultado.push(parsed)
  }
  return resultado
}
