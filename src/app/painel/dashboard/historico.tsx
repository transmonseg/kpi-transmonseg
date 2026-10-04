'use client'

import { useEffect, useState } from 'react'
import { REDE_LABEL } from '@/lib/kpi/redes'
import { ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr'

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
    return (
      <div className="space-y-4">
        {[0, 1, 2].map(i => <div key={i} className="h-[92px] animate-shimmer rounded-[var(--radius-card)]" style={{ animationDelay: `${i * 80}ms` }} />)}
      </div>
    )
  }
  if (dias.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] py-20 text-center animate-fade-up">
        <ClockCounterClockwise size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
        <div className="mt-3 text-[14px] font-semibold text-[var(--color-fg)]">Nenhum KPI inserido ainda</div>
        <div className="mt-1 text-[13px] text-[var(--color-fg-muted)]">Vá na aba <span className="font-medium text-[var(--color-fg)]">Inserir KPIs</span> e suba as planilhas do dia.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {dias.map((dia, i) => (
        <div
          key={dia.data}
          className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 sm:p-6 shadow-soft animate-fade-up"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <span className="text-numeric text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">{fmtData(dia.data)}</span>
              <span className="text-overline"><span className="text-numeric" style={{ letterSpacing: 'normal' }}>{dia.completude}</span> redes</span>
            </div>
            <button
              onClick={() => onAbrirDia(dia.data)}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3.5 text-[12px] font-medium text-[var(--color-fg)] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)]"
            >
              Ver no dashboard
            </button>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {Object.entries(dia.redes).sort().map(([rede, n]) => (
              <a
                key={rede}
                href={`/api/kpi-manual/historico?download=${dia.data}/${rede}`}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2 py-1 text-[11px] text-[var(--color-fg-muted)] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                title="Baixar XLSX desta rede"
              >
                {REDE_LABEL[rede] ?? rede}
                <span className="text-numeric text-[var(--color-fg-subtle)]">{n}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
