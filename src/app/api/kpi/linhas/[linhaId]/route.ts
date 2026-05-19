import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const TIME_FIELDS = [
  'saida_cd',
  'chd_loja_1', 'saida_loja_1',
  'chd_loja_2', 'saida_loja_2',
  'chd_loja_3', 'saida_loja_3',
] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ linhaId: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { linhaId } = await params
  const body = await req.json() as Record<string, string | null>

  const updates: Record<string, unknown> = {}
  for (const field of TIME_FIELDS) {
    if (field in body) updates[field] = body[field]
  }

  // Recompute tempo_loja_N_min from updated times
  for (const n of [1, 2, 3] as const) {
    const chd = (updates[`chd_loja_${n}`] ?? body[`chd_loja_${n}`]) as string | null | undefined
    const sai = (updates[`saida_loja_${n}`] ?? body[`saida_loja_${n}`]) as string | null | undefined
    if (chd && sai) {
      updates[`tempo_loja_${n}_min`] = Math.max(
        0,
        Math.round((new Date(sai).getTime() - new Date(chd).getTime()) / 60000),
      )
    } else if (chd === null || sai === null) {
      updates[`tempo_loja_${n}_min`] = null
    }
  }

  if (Object.keys(updates).length === 0)
    return new NextResponse('Nenhum campo para atualizar', { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc.from('kpi_linhas').update(updates).eq('id', linhaId)
  if (error) return new NextResponse(`Erro: ${error.message}`, { status: 500 })

  return NextResponse.json({ ok: true })
}
