import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calcularMetricas, filtrar } from '@/lib/kpi/dashboard-metricas'
import { intervaloPeriodo, intervaloAnterior, carregarEntradasManuais } from '@/lib/kpi/dashboard-query'
import { hojeBR } from '@/lib/data-br'
import { getPerfil, redesEfetivas } from '@/lib/perfil'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const perfil = await getPerfil(user.id)

  const u = new URL(req.url)
  const periodo = u.searchParams.get('periodo') ?? 'dia'
  const ref = u.searchParams.get('data') ?? hojeBR()
  const [ini, fim] = periodo === 'custom'
    ? [u.searchParams.get('de') ?? ref, u.searchParams.get('ate') ?? ref]
    : intervaloPeriodo(periodo, ref)
  // Login restrito (gerente/visualizador) só enxerga a interseção com o que o
  // perfil permite — defesa em profundidade, não confia só no filtro da tela.
  const redes = redesEfetivas(perfil, (u.searchParams.get('redes') ?? '').split(',').filter(Boolean))
  // completo=1 (página de rankings) traz as listas inteiras, sem o corte top-N.
  const completo = u.searchParams.get('completo') === '1'

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

  return NextResponse.json({ periodo, ref, intervalo: [ini, fim], redes, metricas: calcularMetricas(filt, completo), metricasAnterior })
}
