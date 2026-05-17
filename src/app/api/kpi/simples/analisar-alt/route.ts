import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseAlteracaoText } from '@/lib/parsers/alteracao-text'

export const runtime = 'nodejs'

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

function splitAlteracoes(texto: string): string[] {
  // Divide por linhas que iniciam com "ALTERAÇÃO" (com ou sem emoji), mantendo o header em cada parte
  const parts = texto.split(/(?=(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]*)?altera[çc][aã]o)/iu)
  const clean = parts.map(s => s.trim()).filter(Boolean)
  return clean.length > 1 ? clean : [texto.trim()]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  let texto: string

  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => null)
    if (!body?.texto) return new NextResponse('"texto" obrigatório.', { status: 400 })
    texto = String(body.texto)
  } else {
    const fd = await req.formData()
    const pdfFile = fd.get('pdf')
    const textoField = fd.get('texto')
    if (pdfFile instanceof File) {
      const buf = Buffer.from(await pdfFile.arrayBuffer())
      const result = await pdfParse(buf)
      texto = result.text
    } else if (typeof textoField === 'string') {
      texto = textoField
    } else {
      return new NextResponse('Envie "texto" ou "pdf".', { status: 400 })
    }
  }

  const partes = splitAlteracoes(texto)
  const results = partes
    .map(p => parseAlteracaoText(p))
    .filter(r => r.rede_id || r.entra || r.sai)

  return NextResponse.json(results.length > 0 ? results : [parseAlteracaoText(texto)])
}
