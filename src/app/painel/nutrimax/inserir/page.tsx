'use client'

import { useState } from 'react'

export default function NutrimaxInserirPage() {
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState('')
  const [pending, setPending] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar() {
    if (!file || !data) return
    setPending(true)
    setErro(null)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('data', data)
      const res = await fetch('/api/kpi-nutrimax/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json() as { inseridas: number }
      setMsg(`${json.inseridas} clientes inseridos pra ${data}.`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao subir.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-6 px-5 py-8">
      <header>
        <span className="text-overline">Nutry Max</span>
        <h1 className="mt-1 text-display text-[28px] leading-none text-[var(--color-fg)]">Inserir KPI</h1>
        <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">
          Suba de volta o mesmo XLSX baixado em &quot;Gerar KPI&quot; pra ele aparecer no Dashboard.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <label className="text-overline" htmlFor="data">Data</label>
        <input
          id="data" type="date" value={data} onChange={e => setData(e.target.value)}
          className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-overline" htmlFor="xlsx">XLSX gerado</label>
        <input
          id="xlsx" type="file" accept=".xlsx"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="text-[13px]"
        />
      </div>

      {erro && (
        <p role="alert" className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)]">
          {erro}
        </p>
      )}
      {msg && (
        <p role="status" className="rounded-md border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-3 py-2 text-[12px] text-[var(--color-success-soft-fg)]">
          {msg}
        </p>
      )}

      <button
        type="button"
        onClick={enviar}
        disabled={!file || !data || pending}
        className="h-10 rounded-full bg-[var(--color-navy-700)] px-6 text-[13px] font-medium text-white transition-opacity disabled:opacity-40"
      >
        {pending ? 'Enviando…' : 'Subir pro Dashboard'}
      </button>
    </div>
  )
}
