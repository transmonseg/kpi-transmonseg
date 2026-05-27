import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { type AlteracaoParsed } from '@/lib/parsers/alteracao-text'
import { parseAlteracoesV2 } from '@/lib/parsers/alteracoes-v2'
import { blocoToParsed } from '@/lib/parsers/alteracoes-v2-adapter'
import { buildLookupContext } from '@/lib/parsers/lookup-canonical'
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'
import { inferirSaiDaEscala } from '@/lib/parsers/inferir-sai'
import type { ParseContext } from '@/lib/parsers/alteracoes-v2.types'

export const runtime = 'nodejs'

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

function parseTextoV2(texto: string, ctx: ParseContext): AlteracaoParsed[] {
  return parseAlteracoesV2(texto, ctx)
    .filter((b) => b.entra || b.sai)
    .map(blocoToParsed)
}

async function extrairAlteracoesPdf(
  buf: Buffer,
  ctx: ParseContext,
): Promise<{ alteracoes: AlteracaoParsed[]; fonte: string }> {
  try {
    const tabulares = await parseAlteracaoPdfTabular(buf)
    if (tabulares.length > 0) return { alteracoes: tabulares, fonte: 'pdf-tabular' }
  } catch {
    // ignora, tenta fallback texto
  }

  const { text } = await pdfParse(buf)
  return { alteracoes: parseTextoV2(text, ctx), fonte: 'pdf-texto' }
}


export async function POST(req: NextRequest) {
  // createClient (com cookies) so pra autenticacao
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  // Bug I3 (auditoria 2026-05-27): buildLookupContext e inferirSaiDaEscala leem
  // escala_linhas/lojas. Se RLS esconder dados do user autenticado, retornam
  // vazio e inferencia falha. Service client ignora RLS — leitura sempre
  // completa. Usar APOS auth check.
  const svc = createServiceClient()
  const ctx = await buildLookupContext(svc)
  const ct = req.headers.get('content-type') ?? ''

  if (!ct.includes('application/json')) {
    const fd = await req.formData()
    const dataField = fd.get('data')
    const data = typeof dataField === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dataField) ? dataField : ''
    const pdfFile = fd.get('pdf')
    if (pdfFile instanceof File) {
      const buf = Buffer.from(await pdfFile.arrayBuffer())
      const { alteracoes } = await extrairAlteracoesPdf(buf, ctx)
      const inferidas = await inferirSaiDaEscala(alteracoes, data, svc)
      return NextResponse.json(inferidas)
    }
    const textoField = fd.get('texto')
    if (typeof textoField === 'string') {
      const alteracoes = parseTextoV2(textoField, ctx)
      const inferidas = await inferirSaiDaEscala(alteracoes, data, svc)
      return NextResponse.json(inferidas)
    }
    return new NextResponse('Envie "texto" ou "pdf".', { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.texto) return new NextResponse('"texto" obrigatório.', { status: 400 })
  const texto = String(body.texto)
  const data = typeof body.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.data) ? body.data : ''
  const alteracoes = parseTextoV2(texto, ctx)
  const inferidas = await inferirSaiDaEscala(alteracoes, data, svc)
  return NextResponse.json(inferidas)
}
