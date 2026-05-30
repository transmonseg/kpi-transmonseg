import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calcularMetricas, filtrar } from '@/lib/kpi/dashboard-metricas'
import { intervaloPeriodo, intervaloAnterior, carregarEntradasManuais } from '@/lib/kpi/dashboard-query'
import { montarNarrativa } from '@/lib/kpi/relatorio-narrativa'
import { Relatorio, type RelatorioCtx } from '@/lib/relatorio/Relatorio'
import { hojeBR } from '@/lib/data-br'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const u = new URL(req.url)
  const periodo = u.searchParams.get('periodo') ?? 'mes'
  const ref = u.searchParams.get('data') ?? hojeBR()
  const redes = (u.searchParams.get('redes') ?? '').split(',').filter(Boolean)

  const intervalo = intervaloPeriodo(periodo, ref)
  const [aIni, aFim] = intervaloAnterior(periodo, ref)

  const svc = createServiceClient()
  let m, ant
  try {
    const atual = filtrar(await carregarEntradasManuais(svc, intervalo[0], intervalo[1]), { redes })
    const anterior = filtrar(await carregarEntradasManuais(svc, aIni, aFim), { redes })
    m = calcularMetricas(atual)
    ant = anterior.length ? calcularMetricas(anterior) : null
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Erro ao carregar KPIs', { status: 500 })
  }

  const narrativa = montarNarrativa(m, ant, periodo, intervalo)

  const ctx: RelatorioCtx = {
    m,
    ant,
    periodo,
    intervalo,
    redes,
    narrativa,
    mes: ref.slice(0, 7),
    geradoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  }

  // O componente Relatorio devolve um <Document>, mas seu tipo de props é { ctx };
  // o cast informa ao renderToBuffer que o elemento renderiza um Document.
  const elemento = React.createElement(Relatorio, { ctx }) as React.ReactElement<DocumentProps>
  const buffer = await renderToBuffer(elemento)

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="relatorio-${periodo}-${intervalo[0]}_a_${intervalo[1]}.pdf"`,
    },
  })
}
