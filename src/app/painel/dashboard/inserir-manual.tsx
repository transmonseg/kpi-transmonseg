'use client'

import { useState, useCallback, useEffect } from 'react'
import { REDES, REDE_LABEL } from '@/lib/kpi/redes'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react/dist/ssr'

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
          <label className="text-overline">Data dos KPIs</label>
          <input
            type="date" value={data} onChange={e => onChange(e.target.value)}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
          />
        </div>
        <div className="text-right">
          <div className="text-display text-numeric text-[28px] text-[var(--color-fg)]">{enviadas}<span className="text-[var(--color-fg-subtle)]">/{REDES.length}</span></div>
          <div className="text-overline">redes · <span className="text-numeric" style={{ letterSpacing: 'normal' }}>{totalLojas}</span> lojas</div>
        </div>
      </div>

      {carregando ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[58px] animate-shimmer rounded-[var(--radius-lg)]" style={{ animationDelay: `${i * 40}ms` }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REDES.map((rede, i) => {
            const e = estados[rede] ?? { status: 'idle' }
            const enviado = e.status === 'ok'
            const ocupado = e.status === 'enviando' || e.status === 'excluindo'
            return (
              <div
                key={rede}
                className={[
                  'relative flex items-center justify-between gap-3 overflow-hidden rounded-[var(--radius-lg)] border px-4 py-3 animate-fade-up transition-[background-color,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  e.status === 'erro' ? 'border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-soft',
                ].join(' ')}
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[var(--color-fg)]">{REDE_LABEL[rede] ?? rede}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)]">
                    {e.status === 'idle' && 'Não enviado'}
                    {ocupado && (
                      <>
                        <span className="inline-block h-3 w-3 animate-[spin_0.7s_linear_infinite] rounded-full border-[1.5px] border-[var(--color-fg-subtle)] border-t-transparent" />
                        {e.status === 'enviando' ? 'Enviando…' : 'Excluindo…'}
                      </>
                    )}
                    {enviado && (
                      <span className="flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
                        <CheckCircle size={12} weight="fill" /> Salvo · <span className="text-numeric">{e.lojas}</span> lojas
                      </span>
                    )}
                    {e.status === 'erro' && (
                      <span className="flex items-center gap-1" style={{ color: 'var(--color-danger-soft-fg)' }} title={e.msg}>
                        <WarningCircle size={12} weight="fill" /> {e.msg ? e.msg.slice(0, 44) + (e.msg.length > 44 ? '…' : '') : 'Falha no envio'}
                      </span>
                    )}
                  </div>
                </div>
                {enviado ? (
                  <button
                    onClick={() => excluir(rede)}
                    className="h-7 shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 text-[11px] font-medium text-[var(--color-fg-muted)] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                  >Excluir</button>
                ) : (
                  <label className={`h-7 inline-flex shrink-0 cursor-pointer items-center rounded-[var(--radius-md)] border px-2.5 text-[11px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${e.status === 'erro' ? 'border-[var(--color-danger)] text-[var(--color-danger)]' : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]'} ${ocupado ? 'pointer-events-none opacity-50' : ''}`}>
                    {e.status === 'erro' ? 'Tentar de novo' : 'Enviar'}
                    <input type="file" accept=".xlsx" className="hidden" onChange={ev => { const f = ev.target.files?.[0]; if (f) enviar(rede, f) }} />
                  </label>
                )}
                {ocupado && (
                  <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-[var(--color-bg-subtle)]">
                    <div className="h-full w-1/3 bg-[var(--color-accent)] animate-progress-sweep" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
