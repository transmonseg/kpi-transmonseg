import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calcularMetricas, filtrar } from '@/lib/kpi/dashboard-metricas'
import { intervaloPeriodo, intervaloAnterior, carregarEntradasManuais } from '@/lib/kpi/dashboard-query'
import { hojeBR } from '@/lib/data-br'

export const runtime = 'nodejs'

// Versão pública (sem login) de /api/dashboard, só pra alimentar o link que a
// gente manda pra fora (/dashboard). Só leitura — service client, nunca grava
// nada — mesmas métricas agregadas que já aparecem pro cliente na tela.
export async function GET(req: NextRequest) {
  const u = new URL(req.url)
  const periodo = u.searchParams.get('periodo') ?? 'dia'
  const ref = u.searchParams.get('data') ?? hojeBR()
  const [ini, fim] = periodo === 'custom'
    ? [u.searchParams.get('de') ?? ref, u.searchParams.get('ate') ?? ref]
    : intervaloPeriodo(periodo, ref)
  const redes = (u.searchParams.get('redes') ?? '').split(',').filter(Boolean)
  const completo = u.searchParams.get('completo') === '1'

  const svc = createServiceClient()
  let linhas
  try {
    linhas = await carregarEntradasManuais(svc, ini, fim)
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Erro ao carregar KPIs', { status: 500 })
  }

  const filt = filtrar(linhas, { redes })

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
