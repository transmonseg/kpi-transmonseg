'use client'

// 16/11 (dono: "relatórios, ver quem tá fazendo a rota e quem não tá"): a
// ordem da rota da Rio Quality dentro do Dashboard -- % na ordem do período,
// por dia, ranking de motoristas/placas e a fila de cada viagem. O relatório
// completo (cliente a cliente, filtros, Excel) fica em Rio Quality › Ordem da rota.
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Path } from '@phosphor-icons/react/dist/ssr'
import { dataCurta } from './calculos'
import { Fila, LegendaOrdem } from '@/app/painel/rioquality/ordem-rota/visao-geral'
import type { OrdemDashboard, ViagemDash } from '@/lib/kpi-romaneio/relatorio-ordem-rota'

export const META_ORDEM = 70
const p1 = (x: number) => `${x.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const n = (x: number) => x.toLocaleString('pt-BR')
const corPct = (x: number) => (x < META_ORDEM ? 'var(--color-warning)' : 'var(--color-success)')
export const normPlaca = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
const MAX_DIAS = 62

/** Busca a ordem da rota do período (só Rio Quality, até 62 dias). */
export function useOrdemRota(cliente: string, de: string, ate: string, recarregar: number): OrdemDashboard | null {
  const [o, setO] = useState<OrdemDashboard | null>(null)
  useEffect(() => {
    setO(null)
    const dias = (Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000 + 1
    if (cliente !== 'rioquality' || dias > MAX_DIAS) return
    let vivo = true
    fetch(`/api/dashboard-kpi/ordem-rota?cliente=${cliente}&de=${de}&ate=${ate}`)
      .then(r => (r.ok ? (r.json() as Promise<OrdemDashboard>) : null))
      .then(j => { if (vivo) setO(j) })
      .catch(() => {})
    return () => { vivo = false }
  }, [cliente, de, ate, recarregar])
  return o
}

export function SecaoOrdemRota({ o, umDia, podeAbrirRelatorio }: { o: OrdemDashboard; umDia: boolean; podeAbrirRelatorio: boolean }) {
  const [por, setPor] = useState<'motoristas' | 'placas'>('motoristas')
  const [todas, setTodas] = useState(false)
  const t = o.total
  const ranking = por === 'motoristas' ? o.motoristas : o.placas
  const viagens = useMemo(() => [...o.viagens].sort((a, b) => a.pct - b.pct || b.entregas - a.entregas), [o.viagens])
  const mostrar = todas ? viagens : viagens.slice(0, 10)
  const varios = o.dias.length > 1
  return (
    <section className="dash-card animate-fade-up overflow-hidden" aria-label="Ordem da rota">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-1 pt-5">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-fg)]"><Path size={16} weight="bold" />Ordem da rota</h3>
          <p className="mt-0.5 max-w-[70ch] text-[12px] text-[var(--color-fg-muted)]">O motorista seguiu a sequência da roteirização? Compara a ordem planejada com a ordem em que o caminhão chegou em cada cliente.</p>
        </div>
        {podeAbrirRelatorio && (
          <a href="/painel/rioquality/ordem-rota" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3.5 text-[12px] font-medium text-[var(--color-fg)] shadow-soft transition hover:border-[var(--color-accent)] active:scale-[0.97]">
            Relatório completo e Excel <ArrowRight size={13} weight="bold" />
          </a>
        )}
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Números */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-[var(--color-bg-subtle)] p-4">
            <p className="text-[12px] font-medium text-[var(--color-fg-muted)]">Entregas na ordem planejada</p>
            <p className="mt-1 text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums" style={{ color: t.pct < META_ORDEM ? 'var(--color-warning)' : 'var(--color-fg)' }}>{p1(t.pct)}</p>
            <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
              <span className="block h-full rounded-full" style={{ width: `${t.pct}%`, background: corPct(t.pct) }} />
            </span>
            <p className="mt-2 text-[12.5px] tabular-nums text-[var(--color-fg-muted)]">{n(t.naOrdem)} de {n(t.entregas)} entregas</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Mini rotulo="Viagens" valor={n(t.viagens)} />
            <Mini rotulo="Fora da ordem" valor={n(t.entregas - t.naOrdem)} alerta={t.entregas - t.naOrdem > 0} />
            <Mini rotulo="De trás pra frente" valor={n(t.invertidas)} alerta={t.invertidas > 0} />
          </div>
          {!umDia && varios && (
            <div>
              <p className="mb-1 text-[12px] font-medium text-[var(--color-fg-muted)]">% na ordem por dia</p>
              <PorDia dias={o.dias} />
            </div>
          )}
        </div>

        {/* Ranking */}
        <div className="flex min-w-0 flex-col rounded-2xl border border-[var(--color-border)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
            <p className="whitespace-nowrap text-[12.5px] font-semibold text-[var(--color-fg)]">Quem menos seguiu a rota</p>
            <div className="inline-flex rounded-full bg-[var(--color-bg-subtle)] p-0.5" role="tablist">
              {([['motoristas', 'Motoristas'], ['placas', 'Placas']] as const).map(([v, rot]) => (
                <button key={v} type="button" role="tab" aria-selected={por === v} onClick={() => setPor(v)}
                  className={`h-7 rounded-full px-3 text-[12px] font-semibold transition-colors ${por === v ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`}>{rot}</button>
              ))}
            </div>
          </div>
          <ul className="max-h-[330px] overflow-y-auto">
            {ranking.map(a => (
              <li key={a.chave} className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2.5 last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[var(--color-fg)]">{a.nome}</span>
                  <span className="block truncate text-[11.5px] text-[var(--color-fg-muted)]">{a.sub} · {a.viagens} {a.viagens === 1 ? 'viagem' : 'viagens'}{a.invertidas ? ` · ${a.invertidas} de trás pra frente` : ''}</span>
                </span>
                <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-bg-subtle)] sm:block">
                  <span className="block h-full rounded-full" style={{ width: `${a.pct}%`, background: corPct(a.pct) }} />
                </span>
                <span className="w-24 shrink-0 text-right">
                  <span className="block text-[14px] font-semibold tabular-nums" style={{ color: a.pct < META_ORDEM ? 'var(--color-warning)' : 'var(--color-fg)' }}>{p1(a.pct)}</span>
                  <span className="block text-[11px] tabular-nums text-[var(--color-fg-subtle)]">{n(a.naOrdem)}/{n(a.entregas)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Todas as viagens */}
      <div className="border-t border-[var(--color-border)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <p className="text-[12.5px] font-semibold text-[var(--color-fg)]">Viagens, pior primeiro <span className="font-medium text-[var(--color-fg-subtle)]">({viagens.length})</span></p>
          <span className="flex flex-wrap items-center gap-3"><LegendaOrdem /><span className="text-[11.5px] text-[var(--color-fg-subtle)]">número = posição no plano</span></span>
        </div>
        <ul>
          {mostrar.map(v => <LinhaViagem key={`${v.data}-${v.placa}-${v.motorista}`} v={v} varios={varios} />)}
        </ul>
        {viagens.length > 10 && (
          <button type="button" onClick={() => setTodas(x => !x)} className="w-full border-t border-[var(--color-border)] px-5 py-3 text-[12.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-bg-subtle)]">
            {todas ? 'Mostrar só as 10 piores' : `Ver todas as ${viagens.length} viagens`}
          </button>
        )}
      </div>
    </section>
  )
}

function LinhaViagem({ v, varios }: { v: ViagemDash; varios: boolean }) {
  return (
    <li className="grid grid-cols-1 gap-2 border-t border-[var(--color-border)] px-5 py-2.5 md:grid-cols-[180px_minmax(0,1fr)_108px] md:items-center md:gap-4">
      <span className="flex min-w-0 items-baseline justify-between gap-2 md:flex-col md:items-start md:gap-0.5">
        <span className="text-[13px] font-semibold text-[var(--color-fg)]">{v.placa}{varios && <span className="ml-1.5 text-[11px] font-medium text-[var(--color-fg-subtle)]">{dataCurta(v.data)}</span>}</span>
        <span className="min-w-0 max-w-full truncate text-[11.5px] text-[var(--color-fg-muted)]" title={v.motorista}>{v.motorista}</span>
      </span>
      <Fila fila={v.fila} naoFeitas={v.naoFeitas} />
      <span className="flex items-baseline justify-between gap-2 md:flex-col md:items-end md:gap-0">
        <span className="text-[14px] font-semibold tabular-nums" style={{ color: v.pct < META_ORDEM ? 'var(--color-warning)' : 'var(--color-fg)' }}>{p1(v.pct)}</span>
        <span className="text-[11px] tabular-nums text-[var(--color-fg-muted)]">{v.naOrdem}/{v.entregas}</span>
        {v.invertida && <span className="whitespace-nowrap text-[10.5px] font-semibold text-[var(--color-warning)]">de trás pra frente</span>}
      </span>
    </li>
  )
}

/** Na gaveta da placa: a fila de cada viagem dela no dia escolhido. */
export function OrdemDaPlaca({ viagens }: { viagens: ViagemDash[] }) {
  if (viagens.length === 0) return null
  return (
    <div className="dash-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-2 pt-4">
        <p className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--color-fg)]"><Path size={15} weight="bold" />Ordem da rota</p>
        <LegendaOrdem />
      </div>
      {viagens.map((v, i) => (
        <div key={i} className="border-t border-[var(--color-border)] px-5 py-3">
          <p className="mb-2 flex items-baseline justify-between gap-3 text-[12px] text-[var(--color-fg-muted)]">
            <span className="truncate">{v.motorista}{v.invertida && <span className="ml-2 font-semibold text-[var(--color-warning)]">de trás pra frente</span>}</span>
            <span className="shrink-0 tabular-nums"><strong className="text-[14px]" style={{ color: v.pct < META_ORDEM ? 'var(--color-warning)' : 'var(--color-fg)' }}>{p1(v.pct)}</strong> · {v.naOrdem}/{v.entregas} na ordem</span>
          </p>
          <Fila fila={v.fila} naoFeitas={v.naoFeitas} />
        </div>
      ))}
    </div>
  )
}

function Mini({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] px-3 py-2.5">
      <p className="text-[11.5px] text-[var(--color-fg-muted)]">{rotulo}</p>
      <p className="mt-0.5 text-[20px] font-semibold tabular-nums" style={{ color: alerta ? 'var(--color-warning)' : 'var(--color-fg)' }}>{valor}</p>
    </div>
  )
}

/** % na ordem por dia: barras com o valor em cima (laranja abaixo da meta). */
function PorDia({ dias }: { dias: OrdemDashboard['dias'] }) {
  const muitos = dias.length > 14
  return (
    <div className="flex h-[150px] items-end gap-1 overflow-x-auto pb-1" role="img" aria-label="% na ordem por dia">
      {dias.map(d => (
        <div key={d.data} className="flex min-w-[22px] flex-1 flex-col items-center gap-1" title={`${dataCurta(d.data)}: ${p1(d.pct)} (${n(d.naOrdem)} de ${n(d.entregas)} entregas, ${d.viagens} viagens)`}>
          {!muitos && <span className="text-[11px] font-semibold tabular-nums text-[var(--color-fg-muted)]">{Math.round(d.pct)}%</span>}
          <span className="block w-full max-w-[44px] rounded-t-md" style={{ height: `${Math.max(4, d.pct)}px`, background: corPct(d.pct) }} />
          <span className="text-[10.5px] tabular-nums text-[var(--color-fg-subtle)]">{dataCurta(d.data)}</span>
        </div>
      ))}
    </div>
  )
}
