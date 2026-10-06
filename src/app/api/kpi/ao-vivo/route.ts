import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { lerEstadoAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import { acessoAoVivo } from './acesso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Estado da tela ao vivo: romaneio do dia + último cálculo do KPI.
export async function GET(req: NextRequest) {
  const a = await acessoAoVivo(req.nextUrl.searchParams.get('cliente'))
  if (!a.ok) return a.resp
  return NextResponse.json({ data: hojeBR(), ...(await lerEstadoAoVivo(a.cliente, hojeBR())) })
}
