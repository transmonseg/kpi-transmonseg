'use client'

import { useTransition } from 'react'
import Link from 'next/link'

type KpiRow = {
  id: string
  data: string
  rede_id: string
  rede_nome: string
  status: string
  qtd_linhas: number | null
  qtd_anomalias_high: number | null
  qtd_anomalias_medium: number | null
  qtd_anomalias_low: number | null
  xlsx_path: string | null
  pdf_path: string | null
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

function AnomBadge({ count, level }: { count: number | null; level: 'H' | 'M' | 'L' }) {
  if (!count) return <span className="text-ink-muted text-xs">—</span>
  const color = level === 'H' ? 'text-red-600' : level === 'M' ? 'text-amber-600' : 'text-slate-500'
  return <span className={`text-xs font-semibold ${color}`}>{count} {level}</span>
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}

function KpiActions({ kpi, data }: { kpi: KpiRow; data: string }) {
  const [processPending, startProcess] = useTransition()
  const [gerarPending, startGerar] = useTransition()

  const highPendentes = (kpi.qtd_anomalias_high ?? 0) > 0 && kpi.status !== 'revisada' && kpi.status !== 'finalizada'

  function processar() {
    startProcess(async () => {
      const res = await fetch('/api/kpi/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, rede_id: kpi.rede_id }),
      })
      if (!res.ok) {
        const msg = await res.text()
        alert(`Erro: ${msg}`)
        return
      }
      window.location.reload()
    })
  }

  function gerar() {
    startGerar(async () => {
      const res = await fetch('/api/kpi/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kpi_id: kpi.id }),
      })
      if (!res.ok) {
        const msg = await res.text()
        alert(`Erro: ${msg}`)
        return
      }
      window.location.reload()
    })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={processar}
        disabled={processPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-hover transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {processPending && <Spinner />}
        Processar
      </button>

      <button
        onClick={gerar}
        disabled={gerarPending || highPendentes}
        title={highPendentes ? 'Revise as anomalias HIGH antes de gerar' : undefined}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {gerarPending && <Spinner />}
        Gerar XLSX/PDF
      </button>

      {kpi.xlsx_path && (
        <Link
          href={`/painel/kpi/${data}?rede=${kpi.rede_id}`}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
        >
          Ver / Download
        </Link>
      )}
    </div>
  )
}

function ProcessarAgoraButton({ data }: { data: string }) {
  const [pending, start] = useTransition()
  function processar() {
    start(async () => {
      const res = await fetch('/api/kpi/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      })
      if (!res.ok) {
        const msg = await res.text()
        alert(`Erro: ${msg}`)
        return
      }
      window.location.reload()
    })
  }
  return (
    <button
      onClick={processar}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending && <Spinner />}
      Processar agora
    </button>
  )
}

export function KpiDoDia({ kpis, data }: { kpis: KpiRow[]; data: string }) {
  if (kpis.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-10 text-center">
        <p className="text-ink-soft text-sm mb-3">Nenhum KPI encontrado para esta data.</p>
        <p className="text-xs text-ink-muted mb-4">
          Se já fez o upload das escalas e do Unitrac, clique abaixo para processar.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <ProcessarAgoraButton data={data} />
          <Link
            href="/painel/kpi/novo"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-hover transition"
          >
            Upload de Relatórios
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-alt">
            <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Rede</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Status</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Linhas</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Anomalias</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Ações</th>
          </tr>
        </thead>
        <tbody>
          {kpis.map((kpi, i) => (
            <tr key={kpi.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-surface-alt/40' : ''}`}>
              <td className="px-4 py-3 font-semibold text-ink">{kpi.rede_nome}</td>
              <td className="px-4 py-3"><StatusBadge status={kpi.status} /></td>
              <td className="px-4 py-3 text-ink-soft">{kpi.qtd_linhas ?? '—'}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <AnomBadge count={kpi.qtd_anomalias_high} level="H" />
                  <AnomBadge count={kpi.qtd_anomalias_medium} level="M" />
                  <AnomBadge count={kpi.qtd_anomalias_low} level="L" />
                </div>
              </td>
              <td className="px-4 py-3">
                <KpiActions kpi={kpi} data={data} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
