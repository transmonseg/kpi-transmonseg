import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { KpiPreview } from './preview'

export async function generateMetadata({ params }: { params: Promise<{ data: string }> }) {
  const { data } = await params
  return { title: `KPI ${data} — Transmonseg` }
}

async function fetchKpisParaData(data: string) {
  const svc = createServiceClient()
  const { data: rows, error } = await svc
    .from('kpis')
    .select('id, rede_id, status, redes ( nome )')
    .eq('data', data)
    .order('rede_id')

  if (error) throw new Error(error.message)
  return (rows ?? []).map(r => ({
    id: r.id as string,
    rede_id: r.rede_id as string,
    rede_nome: (Array.isArray(r.redes) ? (r.redes[0] as { nome: string } | undefined)?.nome : (r.redes as { nome: string } | null)?.nome) ?? (r.rede_id as string),
    status: r.status as string,
  }))
}

export default async function KpiDataPage({
  params,
  searchParams,
}: {
  params: Promise<{ data: string }>
  searchParams: Promise<{ rede?: string }>
}) {
  const { data } = await params
  const sp = await searchParams

  const kpis = await fetchKpisParaData(data)
  if (kpis.length === 0) notFound()

  const redeAtiva = sp.rede ?? kpis[0].rede_id
  const kpiAtivo = kpis.find(k => k.rede_id === redeAtiva) ?? kpis[0]

  const dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="max-w-6xl">
      <div className="border-b border-border pb-5 mb-6">
        <h1 className="text-xl font-bold text-ink capitalize">{dataFmt}</h1>
        <p className="mt-1 text-sm text-ink-soft">Prévia e download do KPI gerado.</p>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {kpis.map(k => (
          <a
            key={k.rede_id}
            href={`/painel/kpi/${data}?rede=${k.rede_id}`}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              k.rede_id === kpiAtivo.rede_id
                ? 'bg-brand-600 text-white'
                : 'border border-border bg-white text-ink hover:bg-surface-hover'
            }`}
          >
            {k.rede_nome}
          </a>
        ))}
      </div>

      <KpiPreview kpiId={kpiAtivo.id} />
    </div>
  )
}
