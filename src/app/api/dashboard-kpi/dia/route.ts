import { NextRequest, NextResponse } from 'next/server'
import { nfsDoDia } from '@/lib/kpi-romaneio/dashboard-kpis'
import { checarAcesso, dataValida } from '../acesso'

export const runtime = 'nodejs'

// GET ?cliente=&data= -> NF por NF do dia (abrir placa / dia).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const a = await checarAcesso(sp.get('cliente'))
  if (!a.ok) return a.resp
  const data = sp.get('data')
  if (!dataValida(data)) return new NextResponse('Data inválida', { status: 400 })
  return NextResponse.json({ nfs: await nfsDoDia(a.cliente, data) })
}
