import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await params

  let body: { cep?: string; endereco?: string; numero?: string; complemento?: string }
  try {
    body = await req.json()
  } catch {
    return new NextResponse('Body inválido.', { status: 400 })
  }

  const patch: Record<string, string> = {}
  if (body.cep !== undefined) patch.cep = body.cep
  if (body.endereco !== undefined) patch.endereco = body.endereco
  if (body.numero !== undefined) patch.numero = body.numero
  if (body.complemento !== undefined) patch.complemento = body.complemento

  if (Object.keys(patch).length === 0)
    return new NextResponse('Nenhum campo enviado.', { status: 400 })

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('clientes_cozinha')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error)
    return new NextResponse(`Erro ao atualizar: ${error.message}`, { status: 500 })

  return NextResponse.json(data)
}
