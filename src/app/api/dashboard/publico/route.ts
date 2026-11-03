import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calcularMetricas, filtrar } from '@/lib/kpi/dashboard-metricas'
import { intervaloPeriodo, intervaloAnterior, carregarEntradasManuais } from '@/lib/kpi/dashboard-query'
import { hojeBR } from '@/lib/data-br'

export const runtime = 'nodejs'

// Versão pública (sem login) de /api/dashboard, só pra alimentar o link que a
// gente manda pra fora (/dashboard). Só leitura — service client, nunca grava
// nada — mesmas métricas agregadas que já aparecem pro cliente na tela.
const MAX_DIAS_PUBLICO = 31

function diasNoIntervalo(ini: string, fim: string): number | null {
  const a = Date.parse(`${ini}T00:00:00Z`), b = Date.parse(`${fim}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || Number.isNaN(a) || Number.isNaN(b) || b < a) return null
  return Math.round((b - a) / 86_400_000) + 1
}

/** SEG-03: a versão pública não leva placa nem nome de motorista. */
function semPessoas<T extends object>(m: T): Omit<T, 'placasMaisAtivas' | 'topMotoristas'> {
  const { placasMaisAtivas: _p, topMotoristas: _m, ...resto } = m as T & { placasMaisAtivas?: unknown; topMotoristas?: unknown }
  void _p; void _m
  return resto
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url)
  const periodo = u.searchParams.get('periodo') ?? 'dia'
  const ref = u.searchParams.get('data') ?? hojeBR()
  const [ini, fim] = periodo === 'custom'
    ? [u.searchParams.get('de') ?? ref, u.searchParams.get('ate') ?? ref]
    : intervaloPeriodo(periodo, ref)
  // SEG-03 (auditoria 03/11): o link público aceitava qualquer período.
  const dias = diasNoIntervalo(ini, fim)
  if (dias == null) return new NextResponse('Período inválido', { status: 400 })
  if (dias > MAX_DIAS_PUBLICO) return new NextResponse(`Período máximo de ${MAX_DIAS_PUBLICO} dias no link público`, { status: 400 })
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

  return NextResponse.json({ periodo, ref, intervalo: [ini, fim], redes, metricas: semPessoas(calcularMetricas(filt, completo)), metricasAnterior: metricasAnterior && semPessoas(metricasAnterior) })
}
