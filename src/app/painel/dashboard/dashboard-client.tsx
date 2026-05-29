'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Metricas } from '@/lib/kpi/dashboard-metricas'
import { REDES, REDE_LABEL } from '@/lib/kpi/redes'
import InserirManual from './inserir-manual'
import Historico from './historico'

type Periodo = 'dia' | 'semana' | 'mes'
type Tab = 'geral' | 'inserir' | 'historico'

const hoje = () => new Date().toISOString().slice(0, 10)

export default function DashboardClient() {
  const [tab, setTab] = useState<Tab>('geral')
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [data, setData] = useState(hoje())
  const [redes, setRedes] = useState<string[]>([])
  const [m, setM] = useState<Metricas | null>(null)
  const [intervalo, setIntervalo] = useState<[string, string] | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (tab !== 'geral') return
    setCarregando(true)
    const qs = new URLSearchParams({ periodo, data, redes: redes.join(',') })
    fetch(`/api/dashboard?${qs}`)
      .then(r => r.json())
      .then(j => { setM(j.metricas); setIntervalo(j.intervalo) })
      .catch(() => setM(null))
      .finally(() => setCarregando(false))
  }, [tab, periodo, data, redes])

  const mesAtual = data.slice(0, 7)

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg)]">Dashboard de Operação</h1>
          <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">Entregas, rastreamento e desempenho por rede.</p>
        </div>
        {tab === 'geral' && (
          <button
            onClick={() => window.open(`/painel/dashboard/print?periodo=${periodo}&data=${data}&redes=${redes.join(',')}`, '_blank')}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 text-[13px] font-semibold text-[var(--color-accent-fg)] transition active:scale-[0.97] hover:bg-[var(--color-accent-hover)]"
          >
            Baixar PDF
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-[var(--color-border)]">
        {([['geral', 'Visão geral'], ['inserir', 'Inserir KPIs'], ['historico', 'Histórico']] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t} onClick={() => setTab(t)}
            className={[
              'relative px-4 py-2.5 text-[13px] font-medium transition',
              tab === t ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            ].join(' ')}
          >
            {label}
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-accent)]" />}
          </button>
        ))}
      </div>

      <div className="py-6">
        {tab === 'inserir' && <InserirManual data={data} onChange={setData} />}
        {tab === 'historico' && <Historico onAbrirDia={(d) => { setData(d); setPeriodo('dia'); setTab('geral') }} />}
        {tab === 'geral' && (
          <VisaoGeral
            periodo={periodo} setPeriodo={setPeriodo} data={data} setData={setData}
            redes={redes} setRedes={setRedes} m={m} intervalo={intervalo} carregando={carregando} mes={mesAtual}
          />
        )}
      </div>
    </div>
  )
}

// ---- Visão geral ----

function VisaoGeral(props: {
  periodo: Periodo; setPeriodo: (p: Periodo) => void
  data: string; setData: (d: string) => void
  redes: string[]; setRedes: (r: string[]) => void
  m: Metricas | null; intervalo: [string, string] | null; carregando: boolean; mes: string
}) {
  const { periodo, setPeriodo, data, setData, redes, setRedes, m, intervalo, carregando, mes } = props

  const toggleRede = (r: string) => setRedes(redes.includes(r) ? redes.filter(x => x !== r) : [...redes, r])

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0.5">
          {(['dia', 'semana', 'mes'] as Periodo[]).map(p => (
            <button
              key={p} onClick={() => setPeriodo(p)}
              className={[
                'rounded-md px-3 py-1.5 text-[12px] font-medium capitalize transition',
                periodo === p ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              ].join(' ')}
            >{p === 'mes' ? 'Mês' : p}</button>
          ))}
        </div>
        <input
          type="date" value={data} onChange={e => setData(e.target.value)}
          className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-[13px] text-[var(--color-fg)] outline-none focus:border-[var(--color-accent)]"
        />
        {intervalo && <span className="font-mono text-[11px] text-[var(--color-fg-muted)]">{intervalo[0]} → {intervalo[1]}</span>}
      </div>

      {/* Chips de rede */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setRedes([])}
          className={['rounded-full border px-3 py-1 text-[12px] font-medium transition',
            redes.length === 0 ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-fg)]' : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'].join(' ')}
        >Todas</button>
        {REDES.map(r => (
          <button
            key={r} onClick={() => toggleRede(r)}
            className={['rounded-full border px-3 py-1 text-[12px] font-medium transition',
              redes.includes(r) ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-fg)]' : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'].join(' ')}
          >{REDE_LABEL[r] ?? r}</button>
        ))}
      </div>

      {carregando ? <SkeletonGrid /> : !m || m.total === 0 ? <Vazio /> : <Conteudo m={m} mes={mes} redes={redes} />}
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--color-bg-subtle)]" />)}
    </div>
  )
}

function Vazio() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] py-20 text-center">
      <div className="text-sm font-semibold text-[var(--color-fg)]">Sem dados neste período</div>
      <div className="mt-1 max-w-sm text-[13px] text-[var(--color-fg-muted)]">Insira os KPIs manuais do dia na aba “Inserir KPIs” para ver as análises aqui.</div>
    </div>
  )
}

const STATUS = {
  entregue: { label: 'Entregues', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  nao_foi: { label: 'Não foi', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  sem_rastreador: { label: 'Sem rastreador', dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
}

function Stat({ valor, label, sub, tone }: { valor: string | number; label: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      <div className={`font-mono text-3xl font-bold leading-none ${tone ?? 'text-[var(--color-fg)]'}`}>{valor}</div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--color-fg-muted)]">{sub}</div>}
    </div>
  )
}

function Conteudo({ m, mes, redes }: { m: Metricas; mes: string; redes: string[] }) {
  return (
    <div className="space-y-8">
      {/* Cards principais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat valor={m.entregue} label="Entregues" tone="text-emerald-600 dark:text-emerald-400" />
        <Stat valor={m.nao_foi} label="Não foi ao cliente" tone="text-amber-600 dark:text-amber-400" />
        <Stat valor={m.sem_rastreador} label="Sem rastreador" tone="text-rose-600 dark:text-rose-400" />
        <Stat valor={`${m.pctEntregue}%`} label="Taxa de entrega" sub={`${m.total} programadas`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Com vs sem rastreador */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">Rastreamento</h3>
          <div className="mt-4 flex items-end gap-2">
            <span className="font-mono text-4xl font-bold text-[var(--color-fg)]">{m.total ? Math.round(100 * m.com_rastreador / m.total) : 0}%</span>
            <span className="mb-1 text-[12px] text-[var(--color-fg-muted)]">com rastreador</span>
          </div>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
            <div className="bg-[var(--color-accent)]" style={{ width: `${m.total ? 100 * m.com_rastreador / m.total : 0}%` }} />
            <div className="bg-rose-500/70" style={{ width: `${m.total ? 100 * m.sem_rastreador / m.total : 0}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-[var(--color-fg-muted)]">
            <span className="font-mono">{m.com_rastreador} com GPS</span>
            <span className="font-mono">{m.sem_rastreador} sem</span>
          </div>
        </div>

        {/* Tempo médio + turnos */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">Tempo médio em loja</h3>
          <div className="mt-4 font-mono text-4xl font-bold text-[var(--color-fg)]">
            {m.tempoMedioLojaMin != null ? `${Math.floor(m.tempoMedioLojaMin / 60)}h${String(m.tempoMedioLojaMin % 60).padStart(2, '0')}` : '—'}
          </div>
          <div className="mt-4 space-y-1.5">
            {(['madrugada', 'manha', 'tarde', 'noite'] as const).map(t => {
              const max = Math.max(1, ...Object.values(m.turnos))
              const label = { madrugada: 'Madrugada', manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }[t]
              return (
                <div key={t} className="flex items-center gap-2">
                  <span className="w-20 text-[11px] text-[var(--color-fg-muted)]">{label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                    <div className="h-full bg-[var(--color-accent)]/60" style={{ width: `${100 * m.turnos[t] / max}%` }} />
                  </div>
                  <span className="w-7 text-right font-mono text-[11px] text-[var(--color-fg-muted)]">{m.turnos[t]}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* % sem rastreador destaque */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">Sem rastreador</h3>
          <div className="mt-4 font-mono text-4xl font-bold text-rose-600 dark:text-rose-400">{m.pctSemRastreador}%</div>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
            das entregas programadas não tiveram registro de GPS. Geralmente cadastro do Unitrac ou placa sem rastreador.
          </p>
        </div>
      </div>

      {/* Série temporal */}
      {m.serie.length > 1 && <SerieChart serie={m.serie} />}

      {/* Tabela por rede */}
      <div>
        <h3 className="mb-3 text-[13px] font-semibold text-[var(--color-fg)]">Por rede</h3>
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-left text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                <th className="px-4 py-2.5 font-semibold">Rede</th>
                <th className="px-4 py-2.5 text-right font-semibold">Entregues</th>
                <th className="px-4 py-2.5 text-right font-semibold">Não foi</th>
                <th className="px-4 py-2.5 text-right font-semibold">Sem rastr.</th>
                <th className="px-4 py-2.5 text-right font-semibold">Taxa</th>
                <th className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">Tempo méd.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {m.porRede.map(r => (
                <tr key={r.rede_id} className="transition hover:bg-[var(--color-bg-subtle)]">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[var(--color-fg)]">{REDE_LABEL[r.rede_id] ?? r.rede_id}</div>
                    <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                      <div className="h-full bg-emerald-500" style={{ width: `${r.pctEntregue}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{r.entregue}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-amber-600 dark:text-amber-400">{r.nao_foi}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-rose-600 dark:text-rose-400">{r.sem_rastreador}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-[var(--color-fg)]">{r.pctEntregue}%</td>
                  <td className="hidden px-4 py-2.5 text-right font-mono text-[var(--color-fg-muted)] sm:table-cell">{r.tempoMedioMin != null ? `${r.tempoMedioMin}m` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Export mensal por rede */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="self-center text-[11px] text-[var(--color-fg-muted)]">Baixar mês ({mes}):</span>
          {m.porRede.map(r => (
            <a key={r.rede_id} href={`/api/dashboard/export-mensal?rede=${r.rede_id}&mes=${mes}`}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-fg-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]">
              {REDE_LABEL[r.rede_id] ?? r.rede_id}
            </a>
          ))}
        </div>
      </div>

      {/* Listas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ListaTop titulo="Top lojas sem rastreador" itens={m.topSemRastreador.map(x => ({ nome: `${REDE_LABEL[x.rede_id] ?? x.rede_id} · ${x.loja}`, valor: x.ocorrencias }))} tone="text-rose-600 dark:text-rose-400" />
        <ListaTop titulo="Top lojas “não foi”" itens={m.topNaoFoi.map(x => ({ nome: `${REDE_LABEL[x.rede_id] ?? x.rede_id} · ${x.loja}`, valor: x.ocorrencias }))} tone="text-amber-600 dark:text-amber-400" />
      </div>
    </div>
  )
}

function ListaTop({ titulo, itens, tone }: { titulo: string; itens: Array<{ nome: string; valor: number }>; tone: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">{titulo}</h3>
      {itens.length === 0 ? (
        <p className="mt-3 text-[13px] text-[var(--color-fg-muted)]">Nada no período.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--color-border)]">
          {itens.slice(0, 8).map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <span className="truncate text-[var(--color-fg)]">{it.nome}</span>
              <span className={`shrink-0 font-mono font-semibold ${tone}`}>{it.valor}×</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SerieChart({ serie }: { serie: Metricas['serie'] }) {
  const max = useMemo(() => Math.max(1, ...serie.map(s => s.total)), [serie])
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">Entregas por dia</h3>
        <div className="flex gap-3 text-[11px] text-[var(--color-fg-muted)]">
          {(['entregue', 'nao_foi', 'sem_rastreador'] as const).map(k => (
            <span key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${STATUS[k].dot}`} />{STATUS[k].label}</span>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-1.5" style={{ height: 160 }}>
        {serie.map(s => (
          <div key={s.data} className="group flex flex-1 flex-col items-center gap-1" title={`${s.data}: ${s.total}`}>
            <div className="flex w-full flex-col justify-end overflow-hidden rounded-t" style={{ height: 130 }}>
              <div className="w-full bg-rose-500/80 transition-all" style={{ height: `${130 * s.sem_rastreador / max}px` }} />
              <div className="w-full bg-amber-500/80 transition-all" style={{ height: `${130 * s.nao_foi / max}px` }} />
              <div className="w-full bg-emerald-500/80 transition-all" style={{ height: `${130 * s.entregue / max}px` }} />
            </div>
            <span className="font-mono text-[9px] text-[var(--color-fg-muted)]">{s.data.slice(8, 10)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
