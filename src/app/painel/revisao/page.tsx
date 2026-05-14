import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { AnomaliaLista, type AnomaliaRow } from './anomalia-lista'

export const metadata = { title: 'Revisar Anomalias — Transmonseg' }

async function fetchAnomalias(params: {
  data: string
  severidade: string
  status: string
}): Promise<AnomaliaRow[]> {
  const svc = createServiceClient()

  let q = svc
    .from('anomalias')
    .select(`
      id,
      codigo,
      severidade,
      descricao,
      sugestao,
      status,
      data,
      kpi_rotas ( placa_norm, rede_id, redes ( nome ) )
    `)
    .eq('data', params.data)
    .order('severidade', { ascending: true })
    .order('codigo')

  if (params.severidade !== 'all') {
    q = q.eq('severidade', params.severidade)
  }
  if (params.status !== 'all') {
    q = q.eq('status', params.status)
  }

  const { data: rows, error } = await q
  if (error) throw new Error(error.message)

  return (rows ?? []).map(r => {
    type RotaRaw = {
      placa_norm: string | null
      rede_id: string | null
      redes: { nome: string } | { nome: string }[] | null
    }
    const rotaRaw = (Array.isArray(r.kpi_rotas) ? r.kpi_rotas[0] : r.kpi_rotas) as RotaRaw | null
    const redeNome = rotaRaw?.redes
      ? (Array.isArray(rotaRaw.redes) ? rotaRaw.redes[0]?.nome : (rotaRaw.redes as { nome: string }).nome)
      : null

    return {
      id: r.id as string,
      codigo: r.codigo as string,
      severidade: r.severidade as 'HIGH' | 'MEDIUM' | 'LOW',
      descricao: r.descricao as string,
      sugestao: r.sugestao as string | null,
      status: r.status as string,
      data: r.data as string,
      placa: rotaRaw?.placa_norm ?? null,
      rede_id: rotaRaw?.rede_id ?? null,
      rede_nome: redeNome ?? null,
    }
  })
}

export default async function RevisaoPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; severidade?: string; status?: string }>
}) {
  const sp = await searchParams
  const hoje = new Date().toISOString().slice(0, 10)
  const data = sp.data ?? hoje
  const severidade = sp.severidade ?? 'all'
  const status = sp.status ?? 'pendente'

  const anomalias = await fetchAnomalias({ data, severidade, status })

  const severidades = ['all', 'HIGH', 'MEDIUM', 'LOW']
  const statusOpts = ['all', 'pendente', 'ignorada', 'aceita', 'corrigida', 'sem_entrega']

  function buildHref(overrides: Record<string, string>) {
    const p = new URLSearchParams({ data, severidade, status, ...overrides })
    return `/painel/revisao?${p.toString()}`
  }

  return (
    <div className="max-w-6xl">
      <div className="border-b border-border pb-5 mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-ink">Revisar Anomalias</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Revise e classifique as anomalias detectadas antes de gerar o KPI.
          </p>
        </div>
        <form method="GET" action="/painel/revisao" className="flex items-center gap-2">
          <input type="hidden" name="severidade" value={severidade} />
          <input type="hidden" name="status" value={status} />
          <input
            type="date"
            name="data"
            defaultValue={data}
            className="rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none transition"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition"
          >
            Ver
          </button>
        </form>
      </div>

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-ink-muted font-semibold uppercase tracking-wider">Severidade:</span>
          {severidades.map(s => (
            <Link
              key={s}
              href={buildHref({ severidade: s })}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                severidade === s
                  ? 'bg-brand-600 text-white'
                  : 'border border-border bg-white text-ink hover:bg-surface-hover'
              }`}
            >
              {s === 'all' ? 'Todos' : s}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-ink-muted font-semibold uppercase tracking-wider">Status:</span>
          {statusOpts.map(s => (
            <Link
              key={s}
              href={buildHref({ status: s })}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                status === s
                  ? 'bg-brand-600 text-white'
                  : 'border border-border bg-white text-ink hover:bg-surface-hover'
              }`}
            >
              {s === 'all' ? 'Todos' : s.replace('_', ' ')}
            </Link>
          ))}
        </div>
      </div>

      <AnomaliaLista anomalias={anomalias} />
    </div>
  )
}
