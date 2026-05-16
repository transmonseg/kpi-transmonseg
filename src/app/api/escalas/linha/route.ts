import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizaPlaca } from '@/lib/utils/placa'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json() as {
    id: string
    motorista_nome?: string
    placa_raw?: string
  }

  const { id, motorista_nome, placa_raw } = body
  if (!id) return new NextResponse('id obrigatório', { status: 400 })

  const patch: Record<string, unknown> = {}
  if (motorista_nome !== undefined) patch.motorista_nome = motorista_nome || null
  if (placa_raw !== undefined) {
    patch.placa_raw = placa_raw || null
    patch.placa_norm = placa_raw ? (normalizaPlaca(placa_raw) ?? null) : null
  }

  if (Object.keys(patch).length === 0)
    return new NextResponse('Nenhum campo para atualizar', { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc.from('escala_linhas').update(patch).eq('id', id)

  if (error)
    return new NextResponse(`Erro ao atualizar: ${error.message}`, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
