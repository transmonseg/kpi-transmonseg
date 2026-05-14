import { NextRequest, NextResponse } from 'next/server'
import { parseAlteracao } from '@/lib/parsers/alteracao'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.texto !== 'string' || !body.texto.trim())
    return new NextResponse('Campo "texto" obrigatório.', { status: 400 })

  const parsed = parseAlteracao(body.texto)
  return NextResponse.json(parsed)
}
