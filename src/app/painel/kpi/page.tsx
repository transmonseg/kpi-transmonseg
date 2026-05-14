import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { KpiDoDia } from './kpi-do-dia'

export const metadata = { title: 'KPI do Dia — Transmonseg' }

async function fetchKpis(data: string) {
  const svc = createServiceClient()

  const { data: rows, error } = await svc
    .from('kpis')
    .select(`
      id,
      data,
      rede_id,
      status,
      qtd_linhas,
      qtd_anomalias_high,
      qtd_anomalias_medium,
      qtd_anomalias_low,
      xlsx_path,
      pdf_path,
      redes ( nome )
    `)
    .eq('data', data)
    .order('rede_id')

  if (error) throw new Error(error.message)

  return (rows ?? []).map(r => ({
    id: r.id as string,
    data: r.data as string,
    rede_id: r.rede_id as string,
    rede_nome: (Array.isArray(r.redes) ? (r.redes[0] as { nome: string } | undefined)?.nome : (r.redes as { nome: string } | null)?.nome) ?? r.rede_id,
    status: r.status as string,
    qtd_linhas: r.qtd_linhas as number | null,
    qtd_anomalias_high: r.qtd_anomalias_high as number | null,
    qtd_anomalias_medium: r.qtd_anomalias_medium as number | null,
    qtd_anomalias_low: r.qtd_anomalias_low as number | null,
    xlsx_path: r.xlsx_path as string | null,
    pdf_path: r.pdf_path as string | null,
  }))
}

export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>
}) {
  const params = await searchParams
  const hoje = new Date().toISOString().slice(0, 10)
  const data = params.data ?? hoje

  const kpis = await fetchKpis(data)

  return (
    <div className="max-w-5xl">
      <div className="border-b border-border pb-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-ink">KPI do Dia</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Processe e gere os KPIs diários por rede.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <form>
            <input
              type="date"
              name="data"
              defaultValue={data}
              onChange={undefined}
              className="rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
            />
            <button
              type="submit"
              className="ml-2 inline-flex items-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition"
            >
              Ver
            </button>
          </form>
          <Link
            href="/painel/kpi/novo"
            className="inline-flex items-center rounded-lg border border-border-strong bg-white px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-hover transition"
          >
            Upload
          </Link>
        </div>
      </div>

      <KpiDoDia kpis={kpis} data={data} />
    </div>
  )
}
