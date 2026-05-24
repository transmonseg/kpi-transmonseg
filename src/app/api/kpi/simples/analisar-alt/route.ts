import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseAlteracaoText, type AlteracaoParsed } from '@/lib/parsers/alteracao-text'
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'

export const runtime = 'nodejs'

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

/**
 * Tenta extrair alterações de um PDF.
 *
 * Estratégia em 2 etapas:
 *   1) Parser tabular (pdfjs-serverless com coordenadas): reconstrói linhas/colunas
 *      da tabela. Funciona para "ALTERAÇÕES NA ESCALA GERAL" com header REDES|TIPO|MOTORISTA|CÓD|PLACA.
 *   2) Fallback texto (pdf-parse + parseAlteracaoText): pra PDFs que são texto narrativo
 *      ("Alteração Prezunic: entra X, sai Y").
 */
async function extrairAlteracoesPdf(buf: Buffer): Promise<{ alteracoes: AlteracaoParsed[]; fonte: string }> {
  // 1) Tentar parser tabular primeiro
  try {
    const tabulares = await parseAlteracaoPdfTabular(buf)
    if (tabulares.length > 0) return { alteracoes: tabulares, fonte: 'pdf-tabular' }
  } catch {
    // ignora, tenta fallback
  }

  // 2) Fallback: pdf-parse + splitAlteracoes + parseAlteracaoText
  const { text } = await pdfParse(buf)
  const partes = splitAlteracoes(text)
  const results = partes.map(p => parseAlteracaoText(p)).filter(r => r.entra || r.sai)
  return {
    alteracoes: results.length > 0 ? results : [parseAlteracaoText(text)],
    fonte: 'pdf-texto',
  }
}

function splitAlteracoes(texto: string): string[] {
  const linhas = texto.split(/\r?\n/)
  const blocos: string[] = []
  let buffer: string[] = []
  let redeCtx = '' // carries rede header (e.g. "Alteração zona sul") into each filial block

  const isInicioBloco = (l: string) =>
    /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]*)?altera[çc][aã]o/iu.test(l) ||
    /^\s*filial\s+\d+\s*$/i.test(l.trim())

  const isRedeHeader = (l: string) =>
    /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]*)?altera[çc][aã]o/iu.test(l) &&
    !/^\s*filial\s+\d+\s*$/i.test(l.trim())

  for (const linha of linhas) {
    const trim = linha.trim()
    if (!trim && buffer.length === 0) continue

    if (isInicioBloco(trim)) {
      if (buffer.length > 0) {
        blocos.push(buffer.join('\n').trim())
        buffer = []
      }
      if (isRedeHeader(trim)) {
        redeCtx = trim
        buffer.push(linha)
      } else {
        // Filial block: prepend rede context so parser can detect rede
        if (redeCtx) buffer.push(redeCtx)
        buffer.push(linha)
      }
    } else {
      buffer.push(linha)
    }
  }
  if (buffer.length > 0) blocos.push(buffer.join('\n').trim())

  const clean = blocos.map(s => s.trim()).filter(Boolean)
  return clean.length > 0 ? clean : [texto.trim()]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const ct = req.headers.get('content-type') ?? ''

  // Caminho A: PDF via formData → roteador tabular-first
  if (!ct.includes('application/json')) {
    const fd = await req.formData()
    const pdfFile = fd.get('pdf')
    if (pdfFile instanceof File) {
      const buf = Buffer.from(await pdfFile.arrayBuffer())
      const { alteracoes } = await extrairAlteracoesPdf(buf)
      return NextResponse.json(alteracoes)
    }
    const textoField = fd.get('texto')
    if (typeof textoField === 'string') {
      const partes = splitAlteracoes(textoField)
      const results = partes.map(p => parseAlteracaoText(p)).filter(r => r.entra || r.sai)
      return NextResponse.json(results.length > 0 ? results : [parseAlteracaoText(textoField)])
    }
    return new NextResponse('Envie "texto" ou "pdf".', { status: 400 })
  }

  // Caminho B: JSON com texto
  const body = await req.json().catch(() => null)
  if (!body?.texto) return new NextResponse('"texto" obrigatório.', { status: 400 })
  const texto = String(body.texto)
  const partes = splitAlteracoes(texto)
  const results = partes.map(p => parseAlteracaoText(p)).filter(r => r.entra || r.sai)
  return NextResponse.json(results.length > 0 ? results : [parseAlteracaoText(texto)])
}
