import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buscarGeracao } from '@/lib/kpi-nutrimax/historico'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null) as { id?: string } | null
  const id = body?.id
  if (!id) return new NextResponse('"id" obrigatório', { status: 400 })

  const svc = createServiceClient()
  const geracao = await buscarGeracao(svc, id)
  if (!geracao) {
    return new NextResponse('Geração não encontrada ou expirada — gere novamente.', { status: 404 })
  }

  return NextResponse.json({ tipo: geracao.tipo, ...(geracao.payload as Record<string, unknown>) })
}
