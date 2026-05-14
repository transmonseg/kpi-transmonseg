'use client'

import { useEffect, useState, useTransition } from 'react'

type KpiLinha = {
  id: string
  ordem: number
  loja_nome: string
  motorista: string | null
  placa: string | null
  carro_ordem: number
  saida_cd: string | null
  chd_loja_1: string | null; saida_loja_1: string | null; tempo_loja_1_min: number | null
  chd_loja_2: string | null; saida_loja_2: string | null; tempo_loja_2_min: number | null
  chd_loja_3: string | null; saida_loja_3: string | null; tempo_loja_3_min: number | null
  observacao: string | null
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}

export function KpiPreview({ kpiId }: { kpiId: string }) {
  const [linhas, setLinhas] = useState<KpiLinha[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [dlPending, startDl] = useTransition()

  useEffect(() => {
    fetch(`/api/kpi/${kpiId}`)
      .then(r => {
        if (!r.ok) return r.text().then(t => Promise.reject(t))
        return r.json()
      })
      .then((d: KpiLinha[]) => setLinhas(d))
      .catch((e: unknown) => setErro(String(e)))
  }, [kpiId])

  function download(tipo: 'xlsx' | 'pdf') {
    startDl(async () => {
      const res = await fetch('/api/kpi/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kpi_id: kpiId, tipo }),
      })
      if (!res.ok) {
        alert(`Erro: ${await res.text()}`)
        return
      }
      const { url } = await res.json() as { url: string }
      window.open(url, '_blank')
    })
  }

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Erro ao carregar KPI: {erro}
      </div>
    )
  }

  if (!linhas) {
    return (
      <div className="flex items-center gap-2 py-10 text-ink-soft text-sm">
        <Spinner /> Carregando…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => download('xlsx')}
          disabled={dlPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
        >
          {dlPending && <Spinner />}
          Download XLSX
        </button>
        <button
          onClick={() => download('pdf')}
          disabled={dlPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition disabled:opacity-50"
        >
          {dlPending && <Spinner />}
          Download PDF
        </button>
      </div>

      <div className="rounded-xl border border-border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="text-left px-3 py-2.5 font-semibold text-ink-muted uppercase tracking-wider">#</th>
              <th className="text-left px-3 py-2.5 font-semibold text-ink-muted uppercase tracking-wider">Loja</th>
              <th className="text-left px-3 py-2.5 font-semibold text-ink-muted uppercase tracking-wider">Motorista</th>
              <th className="text-left px-3 py-2.5 font-semibold text-ink-muted uppercase tracking-wider">Placa</th>
              <th className="text-left px-3 py-2.5 font-semibold text-ink-muted uppercase tracking-wider">Saída CD</th>
              <th className="text-center px-3 py-2.5 font-semibold text-ink-muted uppercase tracking-wider" colSpan={3}>Parada 1</th>
              <th className="text-center px-3 py-2.5 font-semibold text-ink-muted uppercase tracking-wider" colSpan={3}>Parada 2</th>
              <th className="text-center px-3 py-2.5 font-semibold text-ink-muted uppercase tracking-wider" colSpan={3}>Parada 3</th>
              <th className="text-left px-3 py-2.5 font-semibold text-ink-muted uppercase tracking-wider">Obs</th>
            </tr>
            <tr className="border-b border-border bg-surface-alt/60">
              <th colSpan={5} />
              {[1, 2, 3].map(n => (
                <>
                  <th key={`chd-${n}`} className="text-center px-2 py-1 text-[10px] font-semibold text-ink-muted">Cheg.</th>
                  <th key={`sai-${n}`} className="text-center px-2 py-1 text-[10px] font-semibold text-ink-muted">Saída</th>
                  <th key={`tmp-${n}`} className="text-center px-2 py-1 text-[10px] font-semibold text-ink-muted">Min</th>
                </>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-surface-alt/30' : ''}`}>
                <td className="px-3 py-2 text-ink-muted">{l.ordem}</td>
                <td className="px-3 py-2 font-medium text-ink whitespace-nowrap">{l.loja_nome}</td>
                <td className="px-3 py-2 text-ink-soft whitespace-nowrap">{l.motorista ?? '—'}</td>
                <td className="px-3 py-2 text-ink-soft font-mono">{l.placa ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-ink-soft">{fmt(l.saida_cd)}</td>
                <td className="px-2 py-2 text-center font-mono text-ink-soft">{fmt(l.chd_loja_1)}</td>
                <td className="px-2 py-2 text-center font-mono text-ink-soft">{fmt(l.saida_loja_1)}</td>
                <td className="px-2 py-2 text-center text-ink-soft">{l.tempo_loja_1_min ?? '—'}</td>
                <td className="px-2 py-2 text-center font-mono text-ink-soft">{fmt(l.chd_loja_2)}</td>
                <td className="px-2 py-2 text-center font-mono text-ink-soft">{fmt(l.saida_loja_2)}</td>
                <td className="px-2 py-2 text-center text-ink-soft">{l.tempo_loja_2_min ?? '—'}</td>
                <td className="px-2 py-2 text-center font-mono text-ink-soft">{fmt(l.chd_loja_3)}</td>
                <td className="px-2 py-2 text-center font-mono text-ink-soft">{fmt(l.saida_loja_3)}</td>
                <td className="px-2 py-2 text-center text-ink-soft">{l.tempo_loja_3_min ?? '—'}</td>
                <td className="px-3 py-2 text-ink-soft">{l.observacao ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
