'use client'

import { useEffect, useState } from 'react'
import { REDE_LABEL } from '@/lib/kpi/redes'

type DiaHist = { data: string; redes: Record<string, number>; completude: string }

function fmtData(d: string) {
  const [, m, dia] = d.split('-')
  return `${dia}/${m}`
}

export default function Historico({ onAbrirDia }: { onAbrirDia: (d: string) => void }) {
  const [dias, setDias] = useState<DiaHist[] | null>(null)

  useEffect(() => {
    fetch('/api/kpi-manual/historico').then(r => r.json()).then(j => setDias(j.dias ?? [])).catch(() => setDias([]))
  }, [])

  if (dias === null) {
    return <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--color-bg-subtle)]" />)}</div>
  }
  if (dias.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] py-16 text-center">
        <div className="text-sm font-semibold text-[var(--color-fg)]">Nenhum KPI manual inserido ainda</div>
        <div className="mt-1 text-[13px] text-[var(--color-fg-muted)]">Vá na aba Inserir KPIs e suba as planilhas do dia.</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {dias.map(dia => (
        <div key={dia.data} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-lg font-bold text-[var(--color-fg)]">{fmtData(dia.data)}</span>
              <span className="text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">{dia.completude} redes</span>
            </div>
            <button
              onClick={() => onAbrirDia(dia.data)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] transition active:scale-[0.97] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Ver no dashboard
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(dia.redes).sort().map(([rede, n]) => (
              <a
                key={rede}
                href={`/api/kpi-manual/historico?download=${dia.data}/${rede}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2 py-1 text-[11px] text-[var(--color-fg-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                title="Baixar XLSX desta rede"
              >
                {REDE_LABEL[rede] ?? rede}
                <span className="font-mono text-[var(--color-fg)]/60">{n}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
