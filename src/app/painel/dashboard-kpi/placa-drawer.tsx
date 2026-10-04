'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, CheckCircle, WarningCircle } from '@phosphor-icons/react/dist/ssr'
import type { ClienteDash, DiaKpi } from '@/lib/kpi-romaneio/dashboard-kpis'
import type { NfResumo } from '@/lib/kpi-romaneio/resumo-dashboard'
import { dataCurta, dataLonga, fmtDur, fmtInt, fmtKm, fmtPct, tom, COR_TOM, type PlacaAgg } from './calculos'

// Detalhe de uma placa: resumo do período, dia a dia e NF por NF do dia
// escolhido (busca o detalhe só quando abre).
export function PlacaDrawer({ cliente, placa, dias, onFechar }: {
  cliente: ClienteDash
  placa: PlacaAgg
  dias: DiaKpi[]
  onFechar: () => void
}) {
  const diasDaPlaca = useMemo(() => [...placa.porDia].sort((a, b) => b.data.localeCompare(a.data)), [placa])
  const [diaSel, setDiaSel] = useState(diasDaPlaca[0]?.data ?? '')
  const [nfs, setNfs] = useState<NfResumo[] | null>(null)
  const [filtro, setFiltro] = useState<'todas' | 'pendentes'>('todas')
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setAberto(true))
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { cancelAnimationFrame(t); window.removeEventListener('keydown', esc); document.body.style.overflow = prev }
  }, [onFechar])

  useEffect(() => {
    if (!diaSel) return
    let vivo = true
    setNfs(null)
    fetch(`/api/dashboard-kpi/dia?cliente=${cliente}&data=${diaSel}`)
      .then(r => r.json())
      .then(j => { if (vivo) setNfs((j.nfs as NfResumo[]).filter(n => n.placa === placa.placa)) })
      .catch(() => { if (vivo) setNfs([]) })
    return () => { vivo = false }
  }, [cliente, diaSel, placa.placa])

  const lista = (nfs ?? []).filter(n => filtro === 'todas' || n.categoria)
  const pendentes = (nfs ?? []).filter(n => n.categoria).length
  const t = tom(placa.taxa)
  const diaInfo = placa.porDia.find(d => d.data === diaSel)
  const parcial = (dias.find(d => d.data === diaSel)?.resumo.aguardando ?? 0) > 0

  // Portal: fora do bloco animado (transform quebra o position: fixed).
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Placa ${placa.placa}`}>
      <div onClick={onFechar} className={`absolute inset-0 bg-black/45 backdrop-blur-[3px] transition-opacity duration-300 ${aberto ? 'opacity-100' : 'opacity-0'}`} />
      <aside className={`absolute right-0 top-0 flex h-full w-full max-w-[680px] flex-col bg-[var(--color-bg)] shadow-2xl transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${aberto ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Cabeçalho */}
        <div className="dash-hero m-3 rounded-[20px] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium text-white/65">Placa</p>
              <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{placa.placa}</h2>
              <p className="mt-0.5 text-[13px] text-white/75">{placa.motorista || '—'} · {placa.destino || '—'}</p>
            </div>
            <button type="button" onClick={onFechar} aria-label="Fechar" className="inline-flex size-9 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/20 active:scale-95">
              <X size={16} weight="bold" />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-3">
            <Mini rotulo="Taxa" valor={fmtPct(placa.taxa)} cor={COR_TOM[t]} />
            <Mini rotulo="NFs" valor={`${fmtInt(placa.nfConfirmadas)}/${fmtInt(placa.nfPlanejado - placa.nfForaDaConta)}`} />
            <Mini rotulo="KM" valor={fmtKm(placa.km)} />
            <Mini rotulo="Operação" valor={fmtDur(placa.operacaoMedia)} />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6">
          {/* Dias da placa */}
          {diasDaPlaca.length > 1 && (
            <div className="dash-card p-3">
              <p className="px-1 pb-2 text-[12px] font-medium text-[var(--color-fg-muted)]">Dias no período</p>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {diasDaPlaca.map(d => {
                  const naConta = d.nfPlanejado - d.nfForaDaConta
                  const tx = naConta > 0 ? Math.min(100, (d.nfConfirmadas / naConta) * 100) : null
                  const sel = d.data === diaSel
                  return (
                    <button key={d.data} type="button" onClick={() => setDiaSel(d.data)}
                      className={`shrink-0 rounded-2xl border px-3.5 py-2 text-left transition-[background-color,border-color,transform] duration-200 active:scale-[0.97] ${sel ? 'border-[var(--color-navy-700)] bg-[var(--color-navy-700)] text-white' : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-strong)]'}`}>
                      <div className={`text-[12px] ${sel ? 'text-white/70' : 'text-[var(--color-fg-muted)]'}`}>{dataCurta(d.data)}</div>
                      <div className="text-[15px] font-semibold tabular-nums" style={sel ? undefined : { color: COR_TOM[tom(tx)] }}>{fmtPct(tx)}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Dia selecionado */}
          <div className="dash-card overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-3 pt-4">
              <div>
                <p className="text-[15px] font-semibold text-[var(--color-fg)]">{diaSel ? dataLonga(diaSel) : '—'}</p>
                {diaInfo && (
                  <p className="mt-0.5 text-[12px] text-[var(--color-fg-muted)]">
                    Saída {diaInfo.saida ?? '—'} · volta {diaInfo.chegada ?? '—'} · {fmtKm(diaInfo.km)} · operação {fmtDur(diaInfo.operacao)}
                    {parcial && <span className="ml-2 rounded-full bg-[var(--color-warning-soft)] px-2 py-0.5 font-semibold text-[var(--color-warning)]">parcial</span>}
                  </p>
                )}
              </div>
              <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5 text-[12px] font-medium">
                {(['todas', 'pendentes'] as const).map(f => (
                  <button key={f} type="button" onClick={() => setFiltro(f)}
                    className={`rounded-full px-3 py-1 transition-colors ${filtro === f ? 'bg-[var(--color-navy-700)] text-white' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}>
                    {f === 'todas' ? `Todas (${nfs?.length ?? '…'})` : `Pendentes (${nfs ? pendentes : '…'})`}
                  </button>
                ))}
              </div>
            </div>
            {nfs == null ? (
              <div className="space-y-2 px-5 pb-5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--color-bg-subtle)]" />)}</div>
            ) : lista.length === 0 ? (
              <p className="px-5 pb-8 pt-4 text-center text-[13px] text-[var(--color-fg-muted)]">{filtro === 'pendentes' ? 'Nenhuma pendência nesse dia.' : 'Sem NFs dessa placa nesse dia.'}</p>
            ) : (
              <ul>
                {lista.map(n => (
                  <li key={`${n.nf}-${n.carga}`} className="border-t border-[var(--color-border)] px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[var(--color-fg)]">{n.cliente || '—'}</p>
                        <p className="truncate text-[12px] text-[var(--color-fg-muted)]">NF {n.nf} · {n.endereco}</p>
                      </div>
                      <div className="shrink-0 text-right text-[12px] tabular-nums text-[var(--color-fg-muted)]">
                        {n.chegada ? <>{n.chegada}–{n.saida ?? '?'}<br /><span className="text-[var(--color-fg-subtle)]">{fmtDur(n.tempoMin)} no cliente</span></> : '—'}
                      </div>
                    </div>
                    <p className={`mt-1.5 inline-flex items-start gap-1.5 text-[12px] font-medium ${n.categoria ? 'text-[var(--color-warning-soft-fg)]' : 'text-[var(--color-success)]'}`}>
                      {n.categoria ? <WarningCircle size={14} weight="fill" className="mt-px shrink-0 text-[var(--color-warning)]" /> : <CheckCircle size={14} weight="fill" className="mt-px shrink-0" />}
                      <span>{n.categoria ? n.status.charAt(0) + n.status.slice(1).toLowerCase() : 'Entregue'}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  , document.body)
}

function Mini({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-2">
      <p className="text-[11px] text-white/60">{rotulo}</p>
      <p className="text-[16px] font-semibold tabular-nums" style={cor ? { color: '#fff', textShadow: `0 0 18px ${cor}` } : undefined}>{valor}</p>
    </div>
  )
}
