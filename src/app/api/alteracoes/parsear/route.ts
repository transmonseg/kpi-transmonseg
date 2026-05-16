import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseAlteracaoText } from '@/lib/parsers/alteracao-text'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body.texto !== 'string' || !body.texto.trim())
    return new NextResponse('Campo "texto" obrigatório.', { status: 400 })

  try {
    const parsed = parseAlteracaoText(body.texto)
    return NextResponse.json(parsed)
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao parsear alteração.',
      { status: 500 }
    )
  }
}
