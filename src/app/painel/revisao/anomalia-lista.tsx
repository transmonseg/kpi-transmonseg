'use client'

import { useState, useTransition } from 'react'
import { Badge, Button, Card, Input, cn } from '@/components/ui'

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

function SevBadge({ sev }: { sev: AnomaliaRow['severidade'] }) {
  const map: Record<AnomaliaRow['severidade'], 'danger' | 'warning' | 'default'> = {
    HIGH: 'danger',
    MEDIUM: 'warning',
    LOW: 'default',
  }
  return <Badge variant={map[sev]}>{sev}</Badge>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
    pendente: 'default',
    ignorada: 'default',
    aceita: 'info',
    corrigida: 'success',
    sem_entrega: 'warning',
  }
  return (
    <Badge variant={map[status] ?? 'default'}>
      {status.replace('_', ' ')}
    </Badge>
  )
}

function Spinner() {
  return (
    <svg
      className="h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  )
}

function AnomaliaItem({
  anomalia,
  onUpdate,
}: {
  anomalia: AnomaliaRow
  onUpdate: (
    id: string,
    status: ActionStatus,
    extra?: { placa?: string; motorista?: string },
  ) => void
}) {
  const [pending, start] = useTransition()
  const [corrigirOpen, setCorrigirOpen] = useState(false)
  const [placa, setPlaca] = useState(anomalia.placa ?? '')
  const [motorista, setMotorista] = useState('')

  function doAction(
    status: ActionStatus,
    extra?: { placa?: string; motorista?: string },
  ) {
    start(async () => {
      const res = await fetch(`/api/anomalias/${anomalia.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: STATUS_TO_ACAO[status],
          ...(extra
            ? {
                correcao: {
                  placa_norm: extra.placa,
                  motorista: extra.motorista,
                },
              }
            : {}),
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
    <tr className="border-b border-[var(--color-border)] align-top last:border-0 hover:bg-[var(--color-bg-subtle)]/50">
      <td className="whitespace-nowrap px-4 py-2.5">
        <SevBadge sev={anomalia.severidade} />
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-[var(--color-fg-muted)]">
        {anomalia.codigo}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-[var(--color-fg)]">
        {anomalia.placa ?? '—'}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-[var(--color-fg-muted)]">
        {anomalia.rede_nome ?? anomalia.rede_id ?? '—'}
      </td>
      <td className="px-4 py-2.5 text-[12px]">
        <p className="font-medium text-[var(--color-fg)]">
          {anomalia.descricao}
        </p>
        {anomalia.sugestao && (
          <p className="mt-0.5 text-[var(--color-fg-muted)]">
            {anomalia.sugestao}
          </p>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5">
        <StatusBadge status={anomalia.status} />
      </td>
      <td className="px-4 py-2.5">
        {anomalia.status === 'pendente' ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                onClick={() => doAction('ignorada')}
                disabled={pending}
                size="sm"
                variant="secondary"
              >
                {pending && <Spinner />} Ignorar
              </Button>
              <Button
                onClick={() => doAction('aceita')}
                disabled={pending}
                size="sm"
                variant="primary"
              >
                {pending && <Spinner />} Aceitar
              </Button>
              <Button
                onClick={() => doAction('sem_entrega')}
                disabled={pending}
                size="sm"
                variant="secondary"
                className="border-[var(--color-warning)]/40 text-[var(--color-warning-soft-fg)]"
              >
                {pending && <Spinner />} Sem entrega
              </Button>
              <Button
                onClick={() => setCorrigirOpen((v) => !v)}
                disabled={pending}
                size="sm"
                variant="secondary"
                className="border-[var(--color-success)]/40 text-[var(--color-success-soft-fg)]"
              >
                Corrigir
              </Button>
            </div>
            {corrigirOpen && (
              <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3">
                <Input
                  type="text"
                  placeholder="Placa"
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value)}
                  className="h-8 text-[12px]"
                />
                <Input
                  type="text"
                  placeholder="Motorista"
                  value={motorista}
                  onChange={(e) => setMotorista(e.target.value)}
                  className="h-8 text-[12px]"
                />
                <Button
                  onClick={() =>
                    doAction('corrigida', {
                      placa: placa || undefined,
                      motorista: motorista || undefined,
                    })
                  }
                  disabled={pending}
                  size="sm"
                  className="bg-[var(--color-success)] text-white hover:opacity-90"
                >
                  {pending && <Spinner />} Confirmar correção
                </Button>
              </div>
            )}
          </div>
        ) : (
          <span className="text-[12px] text-[var(--color-fg-subtle)]">—</span>
        )}
      </td>
    </tr>
  )
}

export function AnomaliaLista({
  anomalias: initial,
}: {
  anomalias: AnomaliaRow[]
}) {
  const [anomalias, setAnomalias] = useState<AnomaliaRow[]>(initial)

  const highPendentes = anomalias.filter(
    (a) => a.severidade === 'HIGH' && a.status === 'pendente',
  ).length

  function handleUpdate(
    id: string,
    status: ActionStatus,
    extra?: { placa?: string; motorista?: string },
  ) {
    setAnomalias((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status, ...(extra?.placa ? { placa: extra.placa } : {}) }
          : a,
      ),
    )
  }

  if (anomalias.length === 0) {
    return (
      <Card className="px-6 py-12 text-center">
        <p className="text-[13px] text-[var(--color-fg-muted)]">
          Nenhuma anomalia encontrada para os filtros selecionados.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {highPendentes > 0 && (
        <div
          className={cn(
            'rounded-md border px-4 py-3 text-[13px] font-medium',
            'border-transparent bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]',
          )}
        >
          {highPendentes} anomalia{highPendentes !== 1 ? 's' : ''} HIGH pendente
          {highPendentes !== 1 ? 's' : ''} — revise antes de gerar o KPI.
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-left">
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                  Sev.
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                  Código
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                  Placa
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                  Rede
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                  Descrição
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                  Status
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                  Ação
                </th>
              </tr>
            </thead>
            <tbody>
              {anomalias.map((a) => (
                <AnomaliaItem key={a.id} anomalia={a} onUpdate={handleUpdate} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
