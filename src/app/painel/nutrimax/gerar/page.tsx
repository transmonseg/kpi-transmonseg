'use client'

import { useState } from 'react'

export default function NutrimaxGerarPage() {
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState('')
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function gerar() {
    if (!file || !data) return
    setPending(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('data', data)
      const res = await fetch('/api/kpi/nutrimax/gerar', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `KPI-Nutrimax-${data}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-6 px-5 py-8">
      <header>
        <span className="text-overline">Nutrimax</span>
        <h1 className="mt-1 text-display text-[28px] leading-none text-[var(--color-fg)]">Gerar KPI</h1>
        <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">
          Suba o Romaneio de Entrega do dia. O sistema cruza cada cliente com o status já
          calculado pelo Unitrac e gera a planilha pra revisão.
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
        <label className="text-overline" htmlFor="romaneio">Romaneio de Entrega (PDF)</label>
        <input
          id="romaneio" type="file" accept=".pdf"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="text-[13px]"
        />
      </div>

      {erro && (
        <p role="alert" className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)]">
          {erro}
        </p>
      )}

      <button
        type="button"
        onClick={gerar}
        disabled={!file || !data || pending}
        className="h-10 rounded-full bg-[var(--color-navy-700)] px-6 text-[13px] font-medium text-white transition-opacity disabled:opacity-40"
      >
        {pending ? 'Gerando…' : 'Gerar e baixar XLSX'}
      </button>
    </div>
  )
}
