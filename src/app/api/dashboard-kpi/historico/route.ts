import { NextRequest, NextResponse } from 'next/server'
import { historico } from '@/lib/kpi-romaneio/dashboard-kpis'
import { checarAcesso } from '../acesso'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const a = await checarAcesso(req.nextUrl.searchParams.get('cliente'))
  if (!a.ok) return a.resp
  return NextResponse.json({ dias: await historico(a.cliente) })
}
