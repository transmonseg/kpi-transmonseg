import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checarAcesso, dataValida } from '../acesso'

export const runtime = 'nodejs'

// GET ?cliente=&de=&ate= -> tempo na loja, lojas atendidas, horários e ranking
// de lojas das NFs entregues (função kpi_dashboard_lojas, calcula no banco).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const a = await checarAcesso(sp.get('cliente'))
  if (!a.ok) return a.resp
  const de = sp.get('de'), ate = sp.get('ate')
  if (!dataValida(de) || !dataValida(ate)) return new NextResponse('Intervalo inválido', { status: 400 })
  const { data, error } = await createServiceClient().rpc('kpi_dashboard_lojas', { p_cliente: a.cliente, p_de: de, p_ate: ate })
  if (error) return new NextResponse(error.message, { status: 500 })
  return NextResponse.json(data)
}
