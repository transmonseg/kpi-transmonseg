import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { RotaStatus } from '@/lib/types/kpi'

export const runtime = 'nodejs'

const VALID_STATUSES: RotaStatus[] = ['pendente', 'ok', 'revisada', 'sem_entrega']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ rotaId: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { rotaId } = await params
  const body = await req.json() as { status?: string }

  if (!body.status || !VALID_STATUSES.includes(body.status as RotaStatus))
    return new NextResponse(`Status inválido. Use: ${VALID_STATUSES.join(', ')}`, { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc
    .from('kpi_rotas')
    .update({ status: body.status })
    .eq('id', rotaId)

  if (error) return new NextResponse(`Erro ao atualizar rota: ${error.message}`, { status: 500 })

  return NextResponse.json({ ok: true })
}
