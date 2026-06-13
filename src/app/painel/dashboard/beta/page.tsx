'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import DashboardClient from '../dashboard-client'

type Andamento = { ENTREGUE: number; EM_ROTA: number; NA_BASE: number; SEM_SINAL: number }

export default function DashboardBetaPage() {
  const [data, setData] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [puxando, setPuxando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [andamento, setAndamento] = useState<Andamento | null>(null)

  useEffect(() => {
    fetch(`/api/dashboard/beta?periodo=dia&data=${data}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => setAndamento(j?.andamento ?? null))
      .catch(() => setAndamento(null))
  }, [data, nonce])

  async function puxarDia() {
    setPuxando(true); setMsg(null)
    try {
      const res = await fetch('/api/dashboard/beta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) })
      const txt = await res.text()
      if (!res.ok) throw new Error(txt)
      const j = JSON.parse(txt) as { total: number; entregues: number }
      setMsg(`Dia ${data}: ${j.entregues}/${j.total} entregues. Painel atualizado.`)
      setNonce(n => n + 1) // força o DashboardClient a refazer o fetch
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao puxar o dia.')
    } finally { setPuxando(false) }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-[12px] text-[var(--color-warning-soft-fg)]">
        <span className="font-semibold">🛰️ Dashboard API beta</span>
        <span>Puxa o dia da API (últimos ~4 dias) e acumula. Não substitui o normal.</span>
        <Link href="/painel" className="ml-auto underline">← Dashboard normal</Link>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-[var(--color-fg-muted)]">Dia
          <input type="date" value={data} onChange={e => setData(e.target.value)} className="mt-1 rounded border border-[var(--color-border-strong)] bg-transparent px-2 py-1 text-sm text-[var(--color-fg)] [color-scheme:light] dark:[color-scheme:dark]" />
        </label>
        <button type="button" onClick={puxarDia} disabled={puxando}
          className="rounded border border-[var(--color-success)] bg-[var(--color-success-soft)] px-3 py-1.5 text-sm font-medium text-[var(--color-success-soft-fg)] disabled:opacity-60">
          {puxando ? 'Puxando…' : '🛰️ Puxar dia pela API'}
        </button>
        {msg && <span className="text-xs text-[var(--color-fg-muted)]">{msg}</span>}
      </div>
      {andamento && (andamento.ENTREGUE + andamento.EM_ROTA + andamento.NA_BASE + andamento.SEM_SINAL > 0) && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded border border-[var(--color-success)] bg-[var(--color-success-soft)] px-2 py-1 text-[var(--color-success-soft-fg)]">Entregue {andamento.ENTREGUE}</span>
          <span className="rounded border border-[var(--color-info)] px-2 py-1 text-[var(--color-info)]">Em rota {andamento.EM_ROTA}</span>
          <span className="rounded border border-[var(--color-border-strong)] px-2 py-1 text-[var(--color-fg-muted)]">Na base {andamento.NA_BASE}</span>
          {andamento.SEM_SINAL > 0 && <span className="rounded border border-[var(--color-border-strong)] px-2 py-1 text-[var(--color-fg-subtle)]">Sem sinal {andamento.SEM_SINAL}</span>}
        </div>
      )}
      <DashboardClient key={nonce} endpoint="/api/dashboard/beta" />
    </div>
  )
}
