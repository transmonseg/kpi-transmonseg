import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

// Fechamento (carimbo de revisão) de KPI manual por (data, rede). "Só carimba":
// registra quem revisou e quando, sem travar edição. Escrita só via service client.

// POST { data, rede_id } → carimba a revisão (upsert por data,rede_id).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  let body: { data?: unknown; rede_id?: unknown }
  try { body = await req.json() } catch { return new NextResponse('JSON inválido', { status: 400 }) }
  const data = String(body.data ?? '')
  const rede_id = String(body.rede_id ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !rede_id) return new NextResponse('data (YYYY-MM-DD) e rede_id obrigatórios', { status: 400 })

  const fechado_por_nome = user.email ?? null
  const fechado_em = new Date().toISOString()
  const svc = createServiceClient()
  const { error } = await svc.from('kpi_fechamentos').upsert(
    { data, rede_id, fechado_por: user.id, fechado_por_nome, fechado_em },
    { onConflict: 'data,rede_id' },
  )
  if (error) return new NextResponse(error.message, { status: 500 })
  return NextResponse.json({ ok: true, fechado_por_nome, fechado_em })
}

// DELETE ?data=&rede_id= → reabre (remove o carimbo).
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const u = new URL(req.url)
  const data = u.searchParams.get('data') ?? ''
  const rede_id = u.searchParams.get('rede_id') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !rede_id) return new NextResponse('data e rede_id obrigatórios', { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc.from('kpi_fechamentos').delete().eq('data', data).eq('rede_id', rede_id)
  if (error) return new NextResponse(error.message, { status: 500 })
  return NextResponse.json({ ok: true })
}

// GET ?data= → lista os fechamentos daquela data.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const u = new URL(req.url)
  const data = u.searchParams.get('data') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('data (YYYY-MM-DD) obrigatória', { status: 400 })

  const svc = createServiceClient()
  const { data: fechados, error } = await svc.from('kpi_fechamentos')
    .select('rede_id, fechado_por_nome, fechado_em')
    .eq('data', data)
  if (error) return new NextResponse(error.message, { status: 500 })
  return NextResponse.json({ data, fechados: fechados ?? [] })
}
