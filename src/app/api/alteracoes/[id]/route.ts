import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await params
  const svc = createServiceClient()
  const { data, error } = await svc.from('alteracoes').select('*').eq('id', id).single()
  if (error) return new NextResponse(error.message, { status: 404 })

  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || !['aplicar', 'descartar'].includes(body.acao))
    return new NextResponse('Campo "acao" deve ser "aplicar" ou "descartar".', { status: 400 })

  const svc = createServiceClient()

  if (body.acao === 'descartar') {
    const { error } = await svc
      .from('alteracoes')
      .update({ status: 'descartada' })
      .eq('id', id)
    if (error) return new NextResponse(error.message, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // acao === 'aplicar'
  const escalaLinhaId: string | undefined = body.escala_linha_id ?? undefined

  const updatePayload: Record<string, unknown> = {
    status: 'aplicada',
    aplicada_em: new Date().toISOString(),
    aplicada_por: user.id,
  }
  if (escalaLinhaId) updatePayload.escala_linha_id = escalaLinhaId

  const { error: altErr } = await svc
    .from('alteracoes')
    .update(updatePayload)
    .eq('id', id)
  if (altErr) return new NextResponse(altErr.message, { status: 500 })

  if (escalaLinhaId) {
    const { data: alt } = await svc
      .from('alteracoes')
      .select('placa_entra_norm, motorista_entra')
      .eq('id', id)
      .single()

    if (alt && (alt.placa_entra_norm || alt.motorista_entra)) {
      await svc
        .from('escala_linhas')
        .update({
          placa_norm: alt.placa_entra_norm ?? undefined,
          motorista_nome: alt.motorista_entra ?? undefined,
        })
        .eq('id', escalaLinhaId)
    }
  }

  return NextResponse.json({ ok: true })
}
