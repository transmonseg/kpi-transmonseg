'use client'

import { useState, useCallback, useEffect } from 'react'
import { REDES, REDE_LABEL } from '@/lib/kpi/redes'

type Estado = { status: 'idle' | 'enviando' | 'ok' | 'erro' | 'excluindo'; lojas?: number; msg?: string }

export default function InserirManual({ data, onChange }: { data: string; onChange: (d: string) => void }) {
  const [estados, setEstados] = useState<Record<string, Estado>>({})
  const [carregando, setCarregando] = useState(true)

  // Carrega o que já foi enviado pra esta data (persistência real, vinda do banco)
  useEffect(() => {
    setCarregando(true)
    setEstados({})
    fetch(`/api/kpi-manual/historico?data=${data}`)
      .then(r => r.json())
      .then(j => {
        const e: Record<string, Estado> = {}
        for (const [rede, n] of Object.entries(j.redes ?? {})) e[rede] = { status: 'ok', lojas: n as number }
        setEstados(e)
      })
      .catch(() => {})
      .finally(() => setCarregando(false))
  }, [data])

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

  const excluir = useCallback(async (rede: string) => {
    setEstados(s => ({ ...s, [rede]: { status: 'excluindo' } }))
    try {
      await fetch(`/api/kpi-manual/upload?data=${data}&rede_id=${rede}`, { method: 'DELETE' })
      setEstados(s => { const c = { ...s }; delete c[rede]; return c })
    } catch {
      setEstados(s => ({ ...s, [rede]: { status: 'erro', msg: 'falha ao excluir' } }))
    }
  }, [data])

  const enviadas = Object.values(estados).filter(e => e.status === 'ok').length
  const totalLojas = Object.values(estados).reduce((a, e) => a + (e.lojas ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">Data dos KPIs</label>
          <input
            type="date" value={data} onChange={e => onChange(e.target.value)}
            className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-fg)] outline-none transition-colors focus:border-[var(--color-accent)]"
          />
        </div>
        <div className="text-right">
          <div className="text-display text-[28px] text-[var(--color-fg)]">{enviadas}<span className="text-[var(--color-fg-subtle)]">/{REDES.length}</span></div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-fg-subtle)]">redes · <span className="text-numeric">{totalLojas}</span> lojas</div>
        </div>
      </div>

      {carregando ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--color-bg-subtle)]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REDES.map(rede => {
            const e = estados[rede] ?? { status: 'idle' }
            const enviado = e.status === 'ok'
            return (
              <div
                key={rede}
                className={[
                  'flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-4 py-3 transition-colors',
                  enviado ? 'border-[var(--color-success)]/35 bg-[var(--color-success-soft)]'
                    : e.status === 'erro' ? 'border-[var(--color-danger)]/35 bg-[var(--color-danger-soft)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-soft',
                ].join(' ')}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-[var(--color-fg)]">{REDE_LABEL[rede] ?? rede}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-fg-muted)]">
                    {e.status === 'idle' && 'Não enviado'}
                    {e.status === 'enviando' && 'Enviando…'}
                    {e.status === 'excluindo' && 'Excluindo…'}
                    {enviado && <span style={{ color: 'var(--color-success-soft-fg)' }}>Salvo · <span className="text-numeric">{e.lojas}</span> lojas</span>}
                    {e.status === 'erro' && <span style={{ color: 'var(--color-danger-soft-fg)' }}>{e.msg?.slice(0, 40)}</span>}
                  </div>
                </div>
                {enviado ? (
                  <button
                    onClick={() => excluir(rede)}
                    className="shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg-muted)] transition-all duration-150 active:scale-[0.96] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                  >Excluir</button>
                ) : (
                  <label className="shrink-0 cursor-pointer rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg-muted)] transition-all duration-150 active:scale-[0.96] hover:border-[var(--color-navy-700)] hover:text-[var(--color-accent)]">
                    Enviar
                    <input type="file" accept=".xlsx" className="hidden" onChange={ev => { const f = ev.target.files?.[0]; if (f) enviar(rede, f) }} />
                  </label>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
