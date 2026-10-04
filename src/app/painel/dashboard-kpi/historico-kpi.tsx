'use client'

import { useEffect, useMemo, useState } from 'react'
import { DownloadSimple, ArrowRight, Trash, ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr'
import { fmtInstanteBR } from '@/lib/data-br'
import type { ClienteDash, DiaKpi } from '@/lib/kpi-romaneio/dashboard-kpis'
import { dataLonga, fmtKm, fmtInt, fmtPct, tom, COR_TOM, hoje } from './calculos'

function nomeMes(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const t = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function HistoricoKpi({ cliente, podeExcluir, onAbrirDia }: { cliente: ClienteDash; podeExcluir: boolean; onAbrirDia: (d: string) => void }) {
  const [dias, setDias] = useState<DiaKpi[] | null>(null)
  const [recarregar, setRecarregar] = useState(0)
  const [diaBaixar, setDiaBaixar] = useState(hoje())

  useEffect(() => {
    let vivo = true
    setDias(null)
    fetch(`/api/dashboard-kpi/historico?cliente=${cliente}`).then(r => r.json()).then(j => { if (vivo) setDias(j.dias) }).catch(() => { if (vivo) setDias([]) })
    return () => { vivo = false }
  }, [cliente, recarregar])

  const porMes = useMemo(() => {
    const m = new Map<string, DiaKpi[]>()
    for (const d of dias ?? []) m.set(d.data.slice(0, 7), [...(m.get(d.data.slice(0, 7)) ?? []), d])
    return [...m.entries()]
  }, [dias])
  const existe = new Set((dias ?? []).map(d => d.data))

  const excluir = async (data: string) => {
    if (!window.confirm(`Remover o KPI de ${data.split('-').reverse().join('/')} do dashboard?`)) return
    await fetch(`/api/dashboard-kpi?cliente=${cliente}&data=${data}`, { method: 'DELETE' })
    setRecarregar(n => n + 1)
  }

  return (
    <div className="space-y-6">
      <div className="dash-card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--color-fg)]">Baixar um dia</h3>
          <p className="text-[12px] text-[var(--color-fg-muted)]">Escolha a data e baixe a planilha do KPI inserido.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={diaBaixar} max={hoje()} onChange={e => setDiaBaixar(e.target.value)}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[13px] outline-none focus:border-[var(--color-accent)] [color-scheme:light] dark:[color-scheme:dark]" />
          {existe.has(diaBaixar) ? (
            <a href={`/api/dashboard-kpi/arquivo?cliente=${cliente}&data=${diaBaixar}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--color-navy-700)] px-4 text-[13px] font-semibold text-white transition hover:bg-[var(--color-navy-800)] active:scale-[0.97]">
              <DownloadSimple size={14} weight="bold" /> Baixar
            </a>
          ) : (
            <span className="text-[12px] text-[var(--color-fg-subtle)]">{dias ? 'Nenhum KPI inserido nesse dia' : '…'}</span>
          )}
        </div>
      </div>

      {dias == null ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-[var(--color-bg-subtle)]" />)}</div>
      ) : dias.length === 0 ? (
        <div className="dash-card flex flex-col items-center py-16 text-center">
          <ClockCounterClockwise size={26} className="text-[var(--color-fg-subtle)]" />
          <p className="mt-3 text-[14px] text-[var(--color-fg-muted)]">Nenhum KPI inserido ainda.</p>
        </div>
      ) : porMes.map(([mes, lista]) => (
        <section key={mes} className="dash-card overflow-hidden">
          <div className="flex items-baseline justify-between px-5 pb-2 pt-4">
            <h3 className="text-[15px] font-semibold text-[var(--color-fg)]">{nomeMes(mes)}</h3>
            <span className="text-[12px] text-[var(--color-fg-muted)]">{lista.length} {lista.length === 1 ? 'dia' : 'dias'}</span>
          </div>
          <ul>
            {lista.map(d => {
              const parcial = (d.resumo.aguardando ?? 0) > 0
              const km = d.resumo.cargas.reduce((a, c) => a + (c.km ?? 0), 0)
              return (
                <li key={d.data} className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--color-border)] px-5 py-3 transition-colors hover:bg-[var(--color-bg-subtle)]">
                  <div className="min-w-[220px] flex-1">
                    <p className="text-[13px] font-semibold text-[var(--color-fg)]">{dataLonga(d.data)}</p>
                    <p className="text-[12px] text-[var(--color-fg-subtle)]">Inserido {fmtInstanteBR(d.inseridoEm)}{d.inseridoPor ? ` por ${d.inseridoPor}` : ''}</p>
                  </div>
                  <div className="w-24 text-right">
                    <p className="text-[16px] font-semibold tabular-nums" style={{ color: parcial ? 'var(--color-warning)' : COR_TOM[tom(d.resumo.taxa)] }}>{fmtPct(d.resumo.taxa)}</p>
                    {parcial && <p className="text-[11px] font-semibold text-[var(--color-warning)]">parcial</p>}
                  </div>
                  <div className="hidden w-40 text-right text-[12px] tabular-nums text-[var(--color-fg-muted)] md:block">
                    {fmtInt(d.resumo.entregues)}/{fmtInt(d.resumo.nfsNaConta)} NFs · {d.resumo.cargas.length} cargas<br />{fmtKm(km)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => onAbrirDia(d.data)} className="inline-flex h-8 items-center gap-1 rounded-full border border-[var(--color-border)] px-3 text-[12px] font-medium transition hover:border-[var(--color-accent)]">
                      Ver <ArrowRight size={12} weight="bold" />
                    </button>
                    <a href={`/api/dashboard-kpi/arquivo?cliente=${cliente}&data=${d.data}`} title="Baixar planilha" className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-fg-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-fg)]">
                      <DownloadSimple size={14} weight="bold" />
                    </a>
                    {podeExcluir && (
                      <button type="button" onClick={() => excluir(d.data)} title="Remover" className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-fg-muted)] transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]">
                        <Trash size={14} weight="bold" />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
