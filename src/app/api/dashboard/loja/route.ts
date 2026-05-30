import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { intervaloPeriodo, carregarEntradasManuais } from '@/lib/kpi/dashboard-query'
import { hojeBR } from '@/lib/data-br'
import type { EntradaManual } from '@/lib/kpi/parse-kpi-manual'

export const runtime = 'nodejs'

/** Minutos de a→b ("HH:MM"); soma 1440 se atravessar a meia-noite. */
function diffMin(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const [ah, am] = a.split(':').map(Number)
  const [bh, bm] = b.split(':').map(Number)
  let d = (bh * 60 + bm) - (ah * 60 + am)
  if (d < 0) d += 1440
  return d
}

function media(ns: (number | null)[]): number | null {
  const t = ns.filter((n): n is number => n != null)
  return t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : null
}

interface PontoDia {
  data: string
  total: number
  entregue: number
  nao_foi: number
  sem_rast: number
  tempo_rota: number | null
  tempo_loja: number | null
  tempo_total: number | null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const u = new URL(req.url)
  const rede = u.searchParams.get('rede') ?? ''
  const loja = u.searchParams.get('loja') ?? ''
  const periodo = u.searchParams.get('periodo') ?? 'mes'
  const ref = u.searchParams.get('data') ?? hojeBR()
  if (!rede || !loja) return new NextResponse('rede e loja obrigatórios', { status: 400 })

  const [ini, fim] = intervaloPeriodo(periodo, ref)

  const svc = createServiceClient()
  let linhas: EntradaManual[]
  try {
    linhas = await carregarEntradasManuais(svc, ini, fim)
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Erro ao carregar KPIs', { status: 500 })
  }

  const ents = linhas.filter(e => e.rede_id === rede && e.loja === loja)

  // Agrupa por dia.
  const mapDia = new Map<string, EntradaManual[]>()
  for (const e of ents) {
    const a = mapDia.get(e.data) ?? []
    a.push(e)
    mapDia.set(e.data, a)
  }
  const serie: PontoDia[] = [...mapDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, es]) => {
      const entregues = es.filter(e => e.status === 'entregue')
      return {
        data,
        total: es.length,
        entregue: entregues.length,
        nao_foi: es.filter(e => e.status === 'nao_foi').length,
        sem_rast: es.filter(e => e.status === 'sem_rastreador').length,
        tempo_rota: media(entregues.map(e => diffMin(e.saida_cd, e.chd))),
        tempo_loja: media(entregues.map(e => diffMin(e.chd, e.sai))),
        tempo_total: media(entregues.map(e => diffMin(e.saida_cd, e.sai))),
      }
    })

  // Resumo do período inteiro (todos os entregues, não a média das médias diárias).
  const entreguesTodos = ents.filter(e => e.status === 'entregue')
  const total = ents.length
  const entregue = entreguesTodos.length
  const sem_rast = ents.filter(e => e.status === 'sem_rastreador').length
  const resumo = {
    total,
    entregue,
    pctEntregue: total ? Math.round(100 * entregue / total) : 0,
    sem_rast,
    pctSemRastreador: total ? Math.round(100 * sem_rast / total) : 0,
    tempoMedioRota: media(entreguesTodos.map(e => diffMin(e.saida_cd, e.chd))),
    tempoMedioLoja: media(entreguesTodos.map(e => diffMin(e.chd, e.sai))),
    tempoMedioTotal: media(entreguesTodos.map(e => diffMin(e.saida_cd, e.sai))),
  }

  return NextResponse.json({ rede, loja, intervalo: [ini, fim], resumo, serie })
}
