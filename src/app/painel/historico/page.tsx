import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Histórico de KPIs — Transmonseg' }

const PER_PAGE = 25

type KpiHistorico = {
  id: string
  data: string
  rede_id: string
  rede_nome: string
  status: string
  qtd_linhas: number | null
  qtd_anomalias_high: number | null
  qtd_anomalias_medium: number | null
  qtd_anomalias_low: number | null
  gerada_em: string | null
  xlsx_path: string | null
  pdf_path: string | null
}

async function fetchHistorico(params: {
  page: number
  redeId: string
  status: string
  dataInicio: string
  dataFim: string
}) {
  const svc = createServiceClient()
  const from = (params.page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let q = svc
    .from('kpis')
    .select(`
      id, data, rede_id, status,
      qtd_linhas, qtd_anomalias_high, qtd_anomalias_medium, qtd_anomalias_low,
      gerada_em, xlsx_path, pdf_path,
      redes ( nome )
    `, { count: 'exact' })
    .order('data', { ascending: false })
    .order('rede_id')
    .range(from, to)

  if (params.redeId !== 'all') q = q.eq('rede_id', params.redeId)
  if (params.status !== 'all') q = q.eq('status', params.status)
  if (params.dataInicio) q = q.gte('data', params.dataInicio)
  if (params.dataFim) q = q.lte('data', params.dataFim)

  const { data: rows, error, count } = await q
  if (error) throw new Error(error.message)

  const kpis: KpiHistorico[] = (rows ?? []).map(r => ({
    id: r.id as string,
    data: r.data as string,
    rede_id: r.rede_id as string,
    rede_nome: (Array.isArray(r.redes) ? (r.redes[0] as { nome: string } | undefined)?.nome : (r.redes as { nome: string } | null)?.nome) ?? (r.rede_id as string),
    status: r.status as string,
    qtd_linhas: r.qtd_linhas as number | null,
    qtd_anomalias_high: r.qtd_anomalias_high as number | null,
    qtd_anomalias_medium: r.qtd_anomalias_medium as number | null,
    qtd_anomalias_low: r.qtd_anomalias_low as number | null,
    gerada_em: r.gerada_em as string | null,
    xlsx_path: r.xlsx_path as string | null,
    pdf_path: r.pdf_path as string | null,
  }))

  return { kpis, total: count ?? 0 }
}

async function fetchRedes() {
  const svc = createServiceClient()
  const { data } = await svc.from('redes').select('id, nome').order('nome')
  return data ?? []
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    rascunho: 'bg-slate-100 text-slate-700',
    gerada: 'bg-brand-50 text-brand-700',
    revisada: 'bg-amber-50 text-amber-700',
    finalizada: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    rede?: string
    status?: string
    inicio?: string
    fim?: string
  }>
}) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const redeId = sp.rede ?? 'all'
  const status = sp.status ?? 'all'
  const dataInicio = sp.inicio ?? ''
  const dataFim = sp.fim ?? ''

  const [{ kpis, total }, redes] = await Promise.all([
    fetchHistorico({ page, redeId, status, dataInicio, dataFim }),
    fetchRedes(),
  ])

  const totalPages = Math.ceil(total / PER_PAGE)

  function buildHref(overrides: Record<string, string | number>) {
    const p = new URLSearchParams({
      page: String(page),
      rede: redeId,
      status,
      ...(dataInicio ? { inicio: dataInicio } : {}),
      ...(dataFim ? { fim: dataFim } : {}),
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    })
    return `/painel/historico?${p.toString()}`
  }

  return (
    <div className="max-w-6xl">
      <div className="border-b border-border pb-5 mb-6">
        <h1 className="text-xl font-bold text-ink">Histórico de KPIs</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Todos os KPIs gerados, com links para download.
        </p>
      </div>

      <form method="GET" action="/painel/historico" className="flex items-end gap-3 mb-6 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Data início</label>
          <input
            type="date"
            name="inicio"
            defaultValue={dataInicio}
            className="rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none transition"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Data fim</label>
          <input
            type="date"
            name="fim"
            defaultValue={dataFim}
            className="rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none transition"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Rede</label>
          <select
            name="rede"
            defaultValue={redeId}
            className="rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none transition"
          >
            <option value="all">Todas</option>
            {redes.map((r: { id: string; nome: string }) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Status</label>
          <select
            name="status"
            defaultValue={status}
            className="rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none transition"
          >
            <option value="all">Todos</option>
            <option value="rascunho">Rascunho</option>
            <option value="gerada">Gerada</option>
            <option value="revisada">Revisada</option>
            <option value="finalizada">Finalizada</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition"
        >
          Filtrar
        </button>
      </form>

      {kpis.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-10 text-center">
          <p className="text-ink-soft text-sm">Nenhum KPI encontrado para os filtros selecionados.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt">
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Rede</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Linhas</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Anomalias</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Gerado em</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Downloads</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k, i) => (
                <tr key={k.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-surface-alt/40' : ''}`}>
                  <td className="px-4 py-3 font-mono text-sm text-ink whitespace-nowrap">
                    <Link href={`/painel/kpi/${k.data}?rede=${k.rede_id}`} className="hover:text-brand-600 hover:underline">
                      {k.data}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft whitespace-nowrap">{k.rede_nome}</td>
                  <td className="px-4 py-3"><StatusBadge status={k.status} /></td>
                  <td className="px-4 py-3 text-ink-soft">{k.qtd_linhas ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {(k.qtd_anomalias_high ?? 0) > 0 && (
                        <span className="text-xs font-semibold text-red-600">{k.qtd_anomalias_high} H</span>
                      )}
                      {(k.qtd_anomalias_medium ?? 0) > 0 && (
                        <span className="text-xs font-semibold text-amber-600">{k.qtd_anomalias_medium} M</span>
                      )}
                      {(k.qtd_anomalias_low ?? 0) > 0 && (
                        <span className="text-xs font-semibold text-slate-500">{k.qtd_anomalias_low} L</span>
                      )}
                      {!k.qtd_anomalias_high && !k.qtd_anomalias_medium && !k.qtd_anomalias_low && (
                        <span className="text-xs text-ink-muted">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">
                    {k.gerada_em
                      ? new Date(k.gerada_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {k.xlsx_path || k.pdf_path ? (
                      <Link
                        href={`/painel/kpi/${k.data}?rede=${k.rede_id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                      >
                        Ver / Baixar
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-xs text-ink-muted">
            {total} resultado{total !== 1 ? 's' : ''} — página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={buildHref({ page: page - 1 })}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-hover transition"
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref({ page: page + 1 })}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-hover transition"
              >
                Próxima
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
