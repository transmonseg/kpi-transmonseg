import { NextRequest, NextResponse } from 'next/server'
import { listarDias, excluirDia } from '@/lib/kpi-romaneio/dashboard-kpis'
import { checarAcesso, dataValida } from './acesso'

export const runtime = 'nodejs'

// GET ?cliente=&de=&ate= -> dias inseridos no intervalo (sem o detalhe por NF).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const a = await checarAcesso(sp.get('cliente'))
  if (!a.ok) return a.resp
  const de = sp.get('de'), ate = sp.get('ate')
  if (!dataValida(de) || !dataValida(ate)) return new NextResponse('Intervalo inválido', { status: 400 })
  return NextResponse.json({ dias: await listarDias(a.cliente, de, ate) })
}

// DELETE ?cliente=&data= -> remove o KPI inserido do dia (admin).
export async function DELETE(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const a = await checarAcesso(sp.get('cliente'), true)
  if (!a.ok) return a.resp
  const data = sp.get('data')
  if (!dataValida(data)) return new NextResponse('Data inválida', { status: 400 })
  await excluirDia(a.cliente, data)
  return NextResponse.json({ ok: true })
}
