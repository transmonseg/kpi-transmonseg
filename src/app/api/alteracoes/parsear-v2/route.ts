import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseAlteracoesV2 } from '@/lib/parsers/alteracoes-v2'
import { buildLookupContext } from '@/lib/parsers/lookup-canonical'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body.texto !== 'string' || !body.texto.trim())
    return new NextResponse('Campo "texto" obrigatório.', { status: 400 })

  const svc = createServiceClient()
  const ctx = await buildLookupContext(svc)
  const blocos = parseAlteracoesV2(body.texto, ctx)

  return NextResponse.json({ blocos })
}
