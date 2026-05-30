import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calcularMetricas, filtrar } from '@/lib/kpi/dashboard-metricas'
import { intervaloPeriodo, intervaloAnterior, carregarEntradasManuais } from '@/lib/kpi/dashboard-query'
import { hojeBR } from '@/lib/data-br'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const u = new URL(req.url)
  const periodo = u.searchParams.get('periodo') ?? 'dia'
  const ref = u.searchParams.get('data') ?? hojeBR()
  const [ini, fim] = periodo === 'custom'
    ? [u.searchParams.get('de') ?? ref, u.searchParams.get('ate') ?? ref]
    : intervaloPeriodo(periodo, ref)
  const redes = (u.searchParams.get('redes') ?? '').split(',').filter(Boolean)

  const svc = createServiceClient()
  let linhas
  try {
    linhas = await carregarEntradasManuais(svc, ini, fim)
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Erro ao carregar KPIs', { status: 500 })
  }

  const filt = filtrar(linhas, { redes })

  // Período anterior (comparação best-effort — erro nunca derruba a resposta).
  let metricasAnterior = null
  if (periodo !== 'custom') {
    try {
      const [aIni, aFim] = intervaloAnterior(periodo, ref)
      const linhasAnt = await carregarEntradasManuais(svc, aIni, aFim)
      const filtAnt = filtrar(linhasAnt, { redes })
      if (filtAnt.length) metricasAnterior = calcularMetricas(filtAnt)
    } catch {
      metricasAnterior = null
    }
  }

  return NextResponse.json({ periodo, ref, intervalo: [ini, fim], redes, metricas: calcularMetricas(filt), metricasAnterior })
}
