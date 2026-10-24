'use client'

import { useEffect, useState } from 'react'
import { ArrowsLeftRight, CircleNotch } from '@phosphor-icons/react/dist/ssr'
import type { ClienteDash } from '@/lib/kpi-romaneio/dashboard-kpis'
import type { OfertaFechamento } from '@/lib/kpi-romaneio/fechamento-dashboard'
import { dataCurta, fmtPct, fmtInt } from './calculos'

// F3-01 (ACH-01, D-26): dia do Dashboard diferente do fechamento das 00:30
// (inserido a mao, parcial ou ausente) -> "Fechamento disponível: X% — trocar".
// A troca e' decisao humana: um clique por dia. So' para quem insere KPI.
export function FechamentoOfertas({ cliente, de, ate, recarregar, onTrocou }: {
  cliente: ClienteDash
  de: string
  ate: string
  recarregar: number
  onTrocou: () => void
}) {
  const [ofertas, setOfertas] = useState<OfertaFechamento[]>([])
  const [trocando, setTrocando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    fetch(`/api/dashboard-kpi/fechamento?cliente=${cliente}&de=${de}&ate=${ate}`)
      .then(r => (r.ok ? r.json() : { ofertas: [] }))
      .then(j => { if (vivo) setOfertas(j.ofertas ?? []) })
      .catch(() => { if (vivo) setOfertas([]) })
    return () => { vivo = false }
  }, [cliente, de, ate, recarregar, versao])

  if (ofertas.length === 0) return null

  const trocar = async (o: OfertaFechamento) => {
    const pergunta = o.atual && !o.atual.parcial
      ? `Trocar o KPI de ${dataCurta(o.data)} no Dashboard (${fmtPct(o.atual.taxa)}, inserido por ${o.atual.inseridoPor ?? '—'}) pelo fechamento (${fmtPct(o.taxa)})?`
      : null
    if (pergunta && !window.confirm(pergunta)) return
    setTrocando(o.data); setErro(null)
    try {
      const r = await fetch('/api/dashboard-kpi/fechamento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente, data: o.data }),
      })
      const j = await r.json().catch(() => ({ ok: false, erro: 'Resposta inválida do servidor.' }))
      if (!j.ok) setErro(j.erro ?? 'Não consegui trocar.')
      else { setVersao(v => v + 1); onTrocou() }
    } catch {
      setErro('Falha de conexão. Tente de novo.')
    } finally {
      setTrocando(null)
    }
  }

  return (
    <section className="dash-card animate-fade-up p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="dash-icone"><ArrowsLeftRight size={18} weight="bold" /></span>
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-fg)]">Fechamento disponível</h3>
          <p className="text-[12px] text-[var(--color-fg-muted)]">O fechamento das 00:30 é diferente do que está no Dashboard. Troque se quiser usar o número oficial.</p>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-[var(--color-border)]">
        {ofertas.map(o => (
          <li key={o.data} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px]">
            <span className="min-w-0">
              <b className="font-semibold text-[var(--color-fg)]">{dataCurta(o.data)}</b>
              <span className="text-[var(--color-fg)]"> · Fechamento disponível: <b className="tabular-nums">{fmtPct(o.taxa)}</b></span>
              <span className="text-[var(--color-fg-muted)]"> ({fmtInt(o.entregues)} de {fmtInt(o.nfsNaConta)} NFs)</span>
              <span className="block text-[12px] text-[var(--color-fg-subtle)]">
                {o.atual ? `No Dashboard: ${fmtPct(o.atual.taxa)}${o.atual.parcial ? ' (parcial, rota em andamento)' : ''}` : 'Dia ainda não está no Dashboard'}
              </span>
            </span>
            <button
              type="button" onClick={() => trocar(o)} disabled={trocando !== null}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3.5 text-[12px] font-medium text-[var(--color-fg)] transition hover:border-[var(--color-navy-700)] hover:text-[var(--color-navy-700)] active:scale-[0.97] disabled:opacity-60"
            >
              {trocando === o.data ? <CircleNotch size={12} weight="bold" className="animate-spin" /> : <ArrowsLeftRight size={12} weight="bold" />}
              {o.atual ? 'Trocar' : 'Usar no Dashboard'}
            </button>
          </li>
        ))}
      </ul>
      {erro && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{erro}</p>}
    </section>
  )
}
