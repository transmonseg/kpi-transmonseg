import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calcularMetricas, filtrar } from '@/lib/kpi/dashboard-metricas'
import type { EntradaManual } from '@/lib/kpi/parse-kpi-manual'
import { hojeBR } from '@/lib/data-br'

export const runtime = 'nodejs'

function intervalo(periodo: string, ref: string): [string, string] {
  const d = new Date(`${ref}T00:00:00Z`)
  if (periodo === 'dia') return [ref, ref]
  if (periodo === 'semana') {
    const day = d.getUTCDay()
    const i = new Date(d); i.setUTCDate(d.getUTCDate() - day)
    const f = new Date(i); f.setUTCDate(i.getUTCDate() + 6)
    return [i.toISOString().slice(0, 10), f.toISOString().slice(0, 10)]
  }
  // mês
  const i = `${ref.slice(0, 7)}-01`
  const f = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return [i, f.toISOString().slice(0, 10)]
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const u = new URL(req.url)
  const periodo = u.searchParams.get('periodo') ?? 'dia'
  const ref = u.searchParams.get('data') ?? hojeBR()
  const [ini, fim] = periodo === 'custom'
    ? [u.searchParams.get('de') ?? ref, u.searchParams.get('ate') ?? ref]
    : intervalo(periodo, ref)
  const redes = (u.searchParams.get('redes') ?? '').split(',').filter(Boolean)

  const svc = createServiceClient()
  const { data, error } = await svc.from('kpi_manual_entradas')
    .select('data, rede_id, loja, placa, motorista, status, saida_cd, chd, sai')
    .gte('data', ini).lte('data', fim)
  if (error) return new NextResponse(error.message, { status: 500 })

  const filt = filtrar((data ?? []) as EntradaManual[], { redes })
  return NextResponse.json({ periodo, ref, intervalo: [ini, fim], redes, metricas: calcularMetricas(filt) })
}
