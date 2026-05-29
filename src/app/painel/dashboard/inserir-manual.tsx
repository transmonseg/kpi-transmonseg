'use client'

import { useState, useCallback } from 'react'
import { REDES, REDE_LABEL } from '@/lib/kpi/redes'

type Estado = { status: 'idle' | 'enviando' | 'ok' | 'erro'; lojas?: number; msg?: string }

export default function InserirManual({ data, onChange }: { data: string; onChange: (d: string) => void }) {
  const [estados, setEstados] = useState<Record<string, Estado>>({})

  const enviar = useCallback(async (rede: string, file: File) => {
    setEstados(s => ({ ...s, [rede]: { status: 'enviando' } }))
    const fd = new FormData()
    fd.set('data', data); fd.set('rede_id', rede); fd.set('file', file)
    try {
      const r = await fetch('/api/kpi-manual/upload', { method: 'POST', body: fd })
      if (!r.ok) { const msg = await r.text(); setEstados(s => ({ ...s, [rede]: { status: 'erro', msg } })); return }
      const j = await r.json()
      setEstados(s => ({ ...s, [rede]: { status: 'ok', lojas: j.inseridas } }))
    } catch (e) {
      setEstados(s => ({ ...s, [rede]: { status: 'erro', msg: String(e) } }))
    }
  }, [data])

  const enviadas = Object.values(estados).filter(e => e.status === 'ok').length
  const totalLojas = Object.values(estados).reduce((a, e) => a + (e.lojas ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">Data dos KPIs</label>
          <input
            type="date" value={data} onChange={e => onChange(e.target.value)}
            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold text-[var(--color-fg)]">{enviadas}<span className="text-[var(--color-fg-muted)]">/{REDES.length}</span></div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">redes · {totalLojas} lojas</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REDES.map(rede => {
          const e = estados[rede] ?? { status: 'idle' }
          return (
            <label
              key={rede}
              className={[
                'group flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition active:scale-[0.99]',
                e.status === 'ok' ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
                  : e.status === 'erro' ? 'border-rose-500/40 bg-rose-500/[0.06]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-strong)]',
              ].join(' ')}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--color-fg)]">{REDE_LABEL[rede] ?? rede}</div>
                <div className="mt-0.5 text-[11px] text-[var(--color-fg-muted)]">
                  {e.status === 'idle' && 'Solte ou escolha o XLSX'}
                  {e.status === 'enviando' && 'Enviando…'}
                  {e.status === 'ok' && <span className="text-emerald-600 dark:text-emerald-400">{e.lojas} lojas lidas</span>}
                  {e.status === 'erro' && <span className="text-rose-600 dark:text-rose-400">{e.msg?.slice(0, 40)}</span>}
                </div>
              </div>
              <span className="shrink-0 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg-muted)] group-hover:border-[var(--color-accent)] group-hover:text-[var(--color-accent)]">
                {e.status === 'ok' ? 'Trocar' : 'Enviar'}
              </span>
              <input
                type="file" accept=".xlsx" className="hidden"
                onChange={ev => { const f = ev.target.files?.[0]; if (f) enviar(rede, f) }}
              />
            </label>
          )
        })}
      </div>
    </div>
  )
}
