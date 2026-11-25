import { NextRequest, NextResponse } from 'next/server'
import { usuarioAtual } from '@/lib/supabase/usuario-atual'
import { createServiceClient } from '@/lib/supabase/service'
import { checarAcesso, dataValida } from '../acesso'

export const runtime = 'nodejs'

const MAX_DIAS = 366

// POST { cliente, de, ate } -> { token }. 25/11: link do Dashboard travado no
// período escolhido, pra mandar pra quem não tem login. Só quem opera a
// empresa (mesma regra do Inserir KPI) gera.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { cliente?: string; de?: string; ate?: string } | null
  const a = await checarAcesso(body?.cliente ?? null, true)
  if (!a.ok) return a.resp
  const de = body?.de ?? null, ate = body?.ate ?? null
  if (!dataValida(de) || !dataValida(ate) || ate < de) return new NextResponse('Período inválido', { status: 400 })
  const dias = (Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000 + 1
  if (dias > MAX_DIAS) return new NextResponse(`Período máximo de ${MAX_DIAS} dias`, { status: 400 })
  const user = await usuarioAtual()
  const { data, error } = await createServiceClient()
    .from('kpi_dashboard_links')
    .insert({ cliente: a.cliente, de, ate, criado_por: user!.id })
    .select('token')
    .single()
  if (error) return new NextResponse(error.message, { status: 500 })
  return NextResponse.json({ token: data.token })
}
