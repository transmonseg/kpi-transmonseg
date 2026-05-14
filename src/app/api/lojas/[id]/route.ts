import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await params
  const svc = createServiceClient()
  const { data, error } = await svc.from('lojas').select('*').eq('id', id).single()

  if (error) return new NextResponse(error.message, { status: 404 })

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await params
  const body = await req.json()

  const allowed = [
    'nome', 'nome_curto', 'codigo_escala', 'codigo_unitrac',
    'nome_unitrac', 'lat', 'lng', 'raio_metros', 'entrega_d1_fixo', 'ativo',
  ]
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  if (Object.keys(patch).length === 0) {
    return new NextResponse('Nenhum campo válido para atualizar.', { status: 400 })
  }

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('lojas')
    .update(patch)
    .eq('id', id)
    .select('id')
    .single()

  if (error) return new NextResponse(error.message, { status: 500 })

  return NextResponse.json({ id: data.id })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await params
  const svc = createServiceClient()
  const { error } = await svc
    .from('lojas')
    .update({ ativo: false })
    .eq('id', id)

  if (error) return new NextResponse(error.message, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
