import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'

async function fetchStatusHoje() {
  const hoje = new Date().toISOString().slice(0, 10)
  const svc = createServiceClient()

  const [escalas, unitrac, kpis, anomalias] = await Promise.all([
    svc.from('escala_uploads').select('id', { count: 'exact', head: true }).eq('data_escala', hoje),
    svc.from('unitrac_uploads').select('id', { count: 'exact', head: true }).eq('data_relatorio', hoje),
    svc.from('kpis').select('id,status').eq('data', hoje),
    svc.from('anomalias').select('id', { count: 'exact', head: true })
      .eq('data', hoje)
      .eq('severidade', 'HIGH')
      .eq('status', 'pendente'),
  ])

  const kpiStatus = (() => {
    const rows = kpis.data ?? []
    if (rows.length === 0) return null
    if (rows.every(r => r.status === 'finalizada')) return 'finalizada'
    if (rows.some(r => r.status === 'gerada' || r.status === 'revisada')) return 'gerada'
    return 'rascunho'
  })()

  return {
    escalasHoje: escalas.count ?? 0,
    unitracHoje: unitrac.count ?? 0,
    kpiStatus,
    anomaliasHighPendentes: anomalias.count ?? 0,
  }
}

export default async function PainelHome() {
  const status = await fetchStatusHoje()

  return (
    <div className="max-w-5xl">
      <div className="border-b border-border pb-5 mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Início</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          Bem-vindo ao sistema de gestão de escalas e KPI da TRANSMONSEG.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
        <Link
          href="/painel/cozinha"
          className="group block rounded-xl border border-border bg-white p-6 hover:border-brand-400 hover:shadow-md hover:shadow-brand-500/10 transition"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-100 transition mb-3">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7l9-4 9 4-9 4-9-4z" />
                  <path d="M3 17l9 4 9-4" />
                  <path d="M3 12l9 4 9-4" />
                </svg>
              </div>
              <h2 className="font-bold text-ink">Cozinha</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Upload da escala da Cozinha Industrial. Gera XLSX e PDF limpos com rota, motorista e placa.
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-emerald-50 text-emerald-700 rounded">
              Ativo
            </span>
          </div>
        </Link>

        <Link
          href="/painel/kpi"
          className="group block rounded-xl border border-border bg-white p-6 hover:border-brand-400 hover:shadow-md hover:shadow-brand-500/10 transition"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-100 transition mb-3">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" />
                  <path d="M7 14l4-4 4 4 6-6" />
                </svg>
              </div>
              <h2 className="font-bold text-ink">KPI Benassi</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Geração automática de KPI a partir da escala e do relatório Unitrac.
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-emerald-50 text-emerald-700 rounded">
              Ativo
            </span>
          </div>
        </Link>
      </div>

      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider">Status de hoje</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-white p-5">
          <p className="text-xs text-ink-muted uppercase tracking-wider font-semibold mb-1">Escalas</p>
          <p className={`text-2xl font-bold ${status.escalasHoje > 0 ? 'text-emerald-600' : 'text-ink-muted'}`}>
            {status.escalasHoje}
          </p>
          <p className="text-xs text-ink-soft mt-1">upload{status.escalasHoje !== 1 ? 's' : ''} hoje</p>
        </div>

        <div className="rounded-xl border border-border bg-white p-5">
          <p className="text-xs text-ink-muted uppercase tracking-wider font-semibold mb-1">Unitrac</p>
          <p className={`text-2xl font-bold ${status.unitracHoje > 0 ? 'text-emerald-600' : 'text-ink-muted'}`}>
            {status.unitracHoje}
          </p>
          <p className="text-xs text-ink-soft mt-1">relatório{status.unitracHoje !== 1 ? 's' : ''} hoje</p>
        </div>

        <Link href="/painel/kpi" className="rounded-xl border border-border bg-white p-5 hover:border-brand-400 transition">
          <p className="text-xs text-ink-muted uppercase tracking-wider font-semibold mb-1">KPI do Dia</p>
          {status.kpiStatus === null ? (
            <>
              <p className="text-2xl font-bold text-ink-muted">—</p>
              <p className="text-xs text-ink-soft mt-1">não processado</p>
            </>
          ) : status.kpiStatus === 'finalizada' ? (
            <>
              <p className="text-2xl font-bold text-emerald-600">OK</p>
              <p className="text-xs text-ink-soft mt-1">finalizado</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-brand-600">↗</p>
              <p className="text-xs text-ink-soft mt-1">{status.kpiStatus}</p>
            </>
          )}
        </Link>

        <Link href="/painel/revisao" className="rounded-xl border border-border bg-white p-5 hover:border-brand-400 transition">
          <p className="text-xs text-ink-muted uppercase tracking-wider font-semibold mb-1">Anomalias HIGH</p>
          <p className={`text-2xl font-bold ${status.anomaliasHighPendentes > 0 ? 'text-red-600' : 'text-ink-muted'}`}>
            {status.anomaliasHighPendentes}
          </p>
          <p className="text-xs text-ink-soft mt-1">pendente{status.anomaliasHighPendentes !== 1 ? 's' : ''}</p>
        </Link>
      </div>
    </div>
  )
}
