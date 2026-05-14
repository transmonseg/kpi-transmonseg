'use client'

import { useState, useTransition } from 'react'

export type AnomaliaRow = {
  id: string
  codigo: string
  severidade: 'HIGH' | 'MEDIUM' | 'LOW'
  descricao: string
  sugestao: string | null
  status: string
  placa: string | null
  rede_id: string | null
  rede_nome: string | null
  data: string
}

type ActionStatus = 'ignorada' | 'aceita' | 'sem_entrega' | 'corrigida'
type AcaoValue = 'ignorar' | 'aceitar' | 'sem_entrega' | 'corrigir'

const STATUS_TO_ACAO: Record<ActionStatus, AcaoValue> = {
  ignorada: 'ignorar',
  aceita: 'aceitar',
  sem_entrega: 'sem_entrega',
  corrigida: 'corrigir',
}

function SevBadge({ sev }: { sev: string }) {
  const map: Record<string, string> = {
    HIGH: 'bg-red-50 text-red-700 border border-red-200',
    MEDIUM: 'bg-amber-50 text-amber-700 border border-amber-200',
    LOW: 'bg-slate-100 text-slate-600 border border-slate-200',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[sev] ?? 'bg-slate-100 text-slate-600'}`}>
      {sev}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: 'bg-slate-100 text-slate-600',
    ignorada: 'bg-slate-50 text-slate-400',
    aceita: 'bg-brand-50 text-brand-700',
    corrigida: 'bg-emerald-50 text-emerald-700',
    sem_entrega: 'bg-orange-50 text-orange-700',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}

function AnomaliaRow({
  anomalia,
  onUpdate,
}: {
  anomalia: AnomaliaRow
  onUpdate: (id: string, status: ActionStatus, extra?: { placa?: string; motorista?: string }) => void
}) {
  const [pending, start] = useTransition()
  const [corrigirOpen, setCorrigirOpen] = useState(false)
  const [placa, setPlaca] = useState(anomalia.placa ?? '')
  const [motorista, setMotorista] = useState('')

  function doAction(status: ActionStatus, extra?: { placa?: string; motorista?: string }) {
    start(async () => {
      const res = await fetch(`/api/anomalias/${anomalia.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: STATUS_TO_ACAO[status],
          ...(extra ? { correcao: { placa_norm: extra.placa, motorista: extra.motorista } } : {}),
        }),
      })
      if (!res.ok) {
        alert(`Erro: ${await res.text()}`)
        return
      }
      onUpdate(anomalia.id, status, extra)
    })
  }

  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="px-4 py-3 whitespace-nowrap">
        <SevBadge sev={anomalia.severidade} />
      </td>
      <td className="px-4 py-3 text-xs font-mono text-ink-soft whitespace-nowrap">{anomalia.codigo}</td>
      <td className="px-4 py-3 text-xs font-mono text-ink whitespace-nowrap">{anomalia.placa ?? '—'}</td>
      <td className="px-4 py-3 text-xs text-ink-soft whitespace-nowrap">{anomalia.rede_nome ?? anomalia.rede_id ?? '—'}</td>
      <td className="px-4 py-3 text-xs text-ink">
        <p className="font-medium">{anomalia.descricao}</p>
        {anomalia.sugestao && (
          <p className="text-ink-muted mt-0.5">{anomalia.sugestao}</p>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <StatusBadge status={anomalia.status} />
      </td>
      <td className="px-4 py-3">
        {anomalia.status === 'pendente' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => doAction('ignorada')}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded border border-border-strong bg-white px-2 py-1 text-[11px] font-semibold text-ink-soft hover:bg-surface-hover transition disabled:opacity-50"
              >
                {pending && <Spinner />} Ignorar
              </button>
              <button
                onClick={() => doAction('aceita')}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded border border-brand-300 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 transition disabled:opacity-50"
              >
                {pending && <Spinner />} Aceitar
              </button>
              <button
                onClick={() => doAction('sem_entrega')}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-100 transition disabled:opacity-50"
              >
                {pending && <Spinner />} Sem entrega
              </button>
              <button
                onClick={() => setCorrigirOpen(v => !v)}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50"
              >
                Corrigir
              </button>
            </div>
            {corrigirOpen && (
              <div className="flex flex-col gap-2 p-3 rounded-lg bg-surface-alt border border-border">
                <input
                  type="text"
                  placeholder="Placa"
                  value={placa}
                  onChange={e => setPlaca(e.target.value)}
                  className="rounded border border-border-strong bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:border-brand-500"
                />
                <input
                  type="text"
                  placeholder="Motorista"
                  value={motorista}
                  onChange={e => setMotorista(e.target.value)}
                  className="rounded border border-border-strong bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:border-brand-500"
                />
                <button
                  onClick={() => doAction('corrigida', { placa: placa || undefined, motorista: motorista || undefined })}
                  disabled={pending}
                  className="inline-flex items-center justify-center gap-1 rounded bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {pending && <Spinner />} Confirmar correção
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-ink-muted">—</span>
        )}
      </td>
    </tr>
  )
}

export function AnomaliaLista({ anomalias: initial }: { anomalias: AnomaliaRow[] }) {
  const [anomalias, setAnomalias] = useState<AnomaliaRow[]>(initial)

  const highPendentes = anomalias.filter(a => a.severidade === 'HIGH' && a.status === 'pendente').length

  function handleUpdate(id: string, status: ActionStatus, extra?: { placa?: string; motorista?: string }) {
    setAnomalias(prev =>
      prev.map(a => a.id === id
        ? { ...a, status, ...(extra?.placa ? { placa: extra.placa } : {}) }
        : a
      )
    )
  }

  if (anomalias.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-10 text-center">
        <p className="text-ink-soft text-sm">Nenhuma anomalia encontrada para os filtros selecionados.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {highPendentes > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">
          {highPendentes} anomalia{highPendentes !== 1 ? 's' : ''} HIGH pendente{highPendentes !== 1 ? 's' : ''} — revise antes de gerar o KPI.
        </div>
      )}

      <div className="rounded-xl border border-border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Sev.</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Código</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Placa</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Rede</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Descrição</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Ação</th>
            </tr>
          </thead>
          <tbody>
            {anomalias.map(a => (
              <AnomaliaRow key={a.id} anomalia={a} onUpdate={handleUpdate} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
