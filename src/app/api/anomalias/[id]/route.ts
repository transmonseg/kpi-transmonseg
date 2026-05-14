import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

type AcaoBody = {
  acao: 'ignorar' | 'aceitar' | 'corrigir' | 'sem_entrega'
  correcao?: {
    placa_norm?: string
    motorista?: string
  }
}

const acaoToStatus: Record<AcaoBody['acao'], string> = {
  ignorar: 'ignorada',
  aceitar: 'aceita',
  corrigir: 'corrigida',
  sem_entrega: 'sem_entrega',
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await params
  const body = await req.json() as AcaoBody
  const { acao, correcao } = body

  if (!['ignorar', 'aceitar', 'corrigir', 'sem_entrega'].includes(acao))
    return new NextResponse('Ação inválida.', { status: 400 })

  const svc = createServiceClient()

  // Fetch anomalia to get kpi_rota_id
  const { data: anomalia, error: fetchErr } = await svc
    .from('anomalias')
    .select('id, kpi_rota_id')
    .eq('id', id)
    .single()

  if (fetchErr || !anomalia)
    return new NextResponse('Anomalia não encontrada.', { status: 404 })

  const { error: updateErr } = await svc
    .from('anomalias')
    .update({
      status: acaoToStatus[acao],
      resolvida_por: user.id,
      resolvida_em: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr)
    return new NextResponse(`Erro ao atualizar anomalia: ${updateErr.message}`, { status: 500 })

  if (acao === 'corrigir' && correcao && anomalia.kpi_rota_id) {
    const { data: rota, error: rotaErr } = await svc
      .from('kpi_rotas')
      .select('escala_linha_id')
      .eq('id', anomalia.kpi_rota_id)
      .single()

    if (rotaErr || !rota)
      return new NextResponse('kpi_rota não encontrada para correção.', { status: 404 })

    const updates: Record<string, string> = {}
    if (correcao.placa_norm) updates.placa_norm = correcao.placa_norm
    if (correcao.motorista) updates.motorista_nome = correcao.motorista

    if (Object.keys(updates).length > 0) {
      const { error: escalaErr } = await svc
        .from('escala_linhas')
        .update(updates)
        .eq('id', rota.escala_linha_id)

      if (escalaErr)
        return new NextResponse(`Erro ao corrigir escala_linha: ${escalaErr.message}`, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
