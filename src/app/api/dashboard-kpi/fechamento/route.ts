import { NextRequest, NextResponse } from 'next/server'
import { listarDias } from '@/lib/kpi-romaneio/dashboard-kpis'
import { ofertasDoPeriodo, trocarPeloFechamento, clienteComFechamento } from '@/lib/kpi-romaneio/fechamento-dashboard'
import { checarAcesso, dataValida } from '../acesso'

export const runtime = 'nodejs'

// F3-01 (ACH-01): "Fechamento disponível: X% — trocar". So' quem insere KPI
// (admin ou operador da empresa) ve e troca. Nada e' enviado a ninguem.

// GET ?cliente=&de=&ate= -> dias em que o fechamento difere do Dashboard.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const a = await checarAcesso(sp.get('cliente'), true)
  if (!a.ok) return a.resp
  const de = sp.get('de'), ate = sp.get('ate')
  if (!dataValida(de) || !dataValida(ate)) return new NextResponse('Intervalo inválido', { status: 400 })
  const dias = await listarDias(a.cliente, de, ate)
  return NextResponse.json({ ofertas: await ofertasDoPeriodo(a.cliente, dias, de, ate) })
}

// POST {cliente, data} -> troca o dia do Dashboard pelo fechamento.
export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => ({})) as { cliente?: string; data?: string }
  const a = await checarAcesso(corpo.cliente ?? null, true)
  if (!a.ok) return a.resp
  if (!dataValida(corpo.data ?? null)) return NextResponse.json({ ok: false, erro: 'Data inválida.' }, { status: 400 })
  if (!clienteComFechamento(a.cliente)) return NextResponse.json({ ok: false, erro: 'Este cliente não tem fechamento automático.' }, { status: 400 })
  const r = await trocarPeloFechamento(a.cliente, corpo.data!, a.email)
  return NextResponse.json(r, { status: r.ok ? 200 : 422 })
}
