'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Metricas } from '@/lib/kpi/dashboard-metricas'
import { REDES, REDE_LABEL } from '@/lib/kpi/redes'
import InserirManual from './inserir-manual'
import Historico from './historico'
import ResumoOperacao, { type ResumoOperacaoData } from './resumo-operacao'
import { hojeBR } from '@/lib/data-br'
import { ArrowSquareOut, CheckCircle, WarningCircle, WifiSlash } from '@phosphor-icons/react/dist/ssr'

type Periodo = 'dia' | 'semana' | 'mes'
type Tab = 'geral' | 'inserir' | 'historico'

const hoje = () => hojeBR()

// status → token semântico (sem cores hardcoded: casa com o resto do sistema)
const STATUS = {
  entregue:       { label: 'Entregues',      cor: 'var(--color-success)' },
  nao_foi:        { label: 'Não foi',        cor: 'var(--color-warning)' },
  sem_rastreador: { label: 'Sem rastreador', cor: 'var(--color-danger)'  },
} as const

const fmtH = (min: number | null | undefined) =>
  min == null ? '—' : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`

export default function DashboardClient({ resumo }: { resumo?: ResumoOperacaoData }) {
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
    <div className="mx-auto max-w-[1180px]">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Operação</span>
          <h1 className="mt-1 text-[30px] font-semibold leading-none tracking-[var(--tracking-display)] text-[var(--color-fg)]">Dashboard</h1>
          <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-[var(--color-fg-muted)]">
            Entregas, rastreamento e desempenho por rede, consolidado a partir dos KPIs inseridos.
          </p>
        </div>
        {tab === 'geral' && (
          <button
            onClick={() => window.open(`/painel/dashboard/print?periodo=${periodo}&data=${data}&redes=${redes.join(',')}`, '_blank')}
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[13px] font-medium text-[var(--color-fg)] shadow-soft transition-all duration-150 active:scale-[0.97] hover:border-[var(--color-navy-700)] hover:bg-[var(--color-navy-700)] hover:text-white"
          >
            <ArrowSquareOut size={14} weight="bold" />
            Baixar PDF
          </button>
        )}
      </header>

      {/* Tabs */}
      <nav className="mt-8 flex gap-1 border-b border-[var(--color-border)]">
        {([['geral', 'Visão geral'], ['inserir', 'Inserir KPIs'], ['historico', 'Histórico']] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t} onClick={() => setTab(t)}
            className={[
              'relative px-4 py-2.5 text-[13px] font-medium transition-colors',
              tab === t ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]',
            ].join(' ')}
          >
            {label}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--color-accent)]" />}
          </button>
        ))}
      </nav>

      <div className="py-8">
        {tab === 'inserir' && <InserirManual data={data} onChange={setData} />}
        {tab === 'historico' && <Historico onAbrirDia={(d) => { setData(d); setPeriodo('dia'); setTab('geral') }} />}
        {tab === 'geral' && (
          <div className="space-y-12">
            {resumo && <ResumoOperacao r={resumo} />}
            <VisaoGeral
              periodo={periodo} setPeriodo={setPeriodo} data={data} setData={setData}
              redes={redes} setRedes={setRedes} m={m} intervalo={intervalo} carregando={carregando} mes={mesAtual}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────── Visão geral ──

function VisaoGeral(props: {
  periodo: Periodo; setPeriodo: (p: Periodo) => void
  data: string; setData: (d: string) => void
  redes: string[]; setRedes: (r: string[]) => void
  m: Metricas | null; intervalo: [string, string] | null; carregando: boolean; mes: string
}) {
  const { periodo, setPeriodo, data, setData, redes, setRedes, m, intervalo, carregando, mes } = props
  const toggleRede = (r: string) => setRedes(redes.includes(r) ? redes.filter(x => x !== r) : [...redes, r])

  return (
    <div className="space-y-10">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0.5 shadow-soft">
          {(['dia', 'semana', 'mes'] as Periodo[]).map(p => (
            <button
              key={p} onClick={() => setPeriodo(p)}
              className={[
                'rounded-[var(--radius-sm)] px-3.5 py-1.5 text-[12.5px] font-medium capitalize transition-all duration-150 active:scale-[0.97]',
                periodo === p ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-soft' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              ].join(' ')}
            >{p === 'mes' ? 'Mês' : p}</button>
          ))}
        </div>
        <input
          type="date" value={data} onChange={e => setData(e.target.value)}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors focus:border-[var(--color-accent)]"
        />
        {intervalo && (
          <span className="text-numeric text-[11.5px] text-[var(--color-fg-subtle)]">{intervalo[0]} → {intervalo[1]}</span>
        )}
      </div>

      {/* Chips de rede */}
      <div className="flex flex-wrap gap-1.5">
        <Chip ativo={redes.length === 0} onClick={() => setRedes([])}>Todas</Chip>
        {REDES.map(r => (
          <Chip key={r} ativo={redes.includes(r)} onClick={() => toggleRede(r)}>{REDE_LABEL[r] ?? r}</Chip>
        ))}
      </div>

      {carregando ? <Skeleton /> : !m || m.total === 0 ? <Vazio /> : <Conteudo m={m} mes={mes} />}
    </div>
  )
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1 text-[12px] font-medium transition-all duration-150 active:scale-[0.96]',
        ativo
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-fg)]'
          : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
      ].join(' ')}
    >{children}</button>
  )
}

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="h-[120px] animate-pulse rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)]" />
      <div className="h-[220px] animate-pulse rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)]" />
    </div>
  )
}

function Vazio() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] py-24 text-center animate-fade-up">
      <WarningCircle size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
      <div className="mt-3 text-[14px] font-semibold text-[var(--color-fg)]">Sem dados neste período</div>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
        Insira os KPIs do dia na aba <span className="font-medium text-[var(--color-fg)]">Inserir KPIs</span> para ver as análises aqui.
      </p>
    </div>
  )
}

function Conteudo({ m, mes }: { m: Metricas; mes: string }) {
  const pctGps = m.total ? Math.round(100 * m.com_rastreador / m.total) : 0
  return (
    <div className="space-y-12">
      {/* Hero de métricas — superfície única dividida (anti-card overuse) */}
      <section className="grid grid-cols-2 divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-soft sm:grid-cols-4 sm:divide-x animate-fade-up">
        <Metric valor={m.entregue} label="Entregues" cor={STATUS.entregue.cor} />
        <Metric valor={m.nao_foi} label="Não foi ao cliente" cor={STATUS.nao_foi.cor} />
        <Metric valor={m.sem_rastreador} label="Sem rastreador" cor={STATUS.sem_rastreador.cor} />
        <Metric valor={`${m.pctEntregue}%`} label="Taxa de entrega" sub={`${m.total} programadas`} destaque />
      </section>

      {/* Série temporal — destaque full-width */}
      {m.serie.length > 1 && <SerieChart serie={m.serie} />}

      {/* Rastreamento + Tempo (grid assimétrico 3fr/2fr) */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Painel titulo="Rastreamento" className="lg:col-span-3">
          <div className="flex items-end gap-2.5">
            <span className="text-display text-[44px] text-[var(--color-fg)]">{pctGps}<span className="text-[24px] text-[var(--color-fg-subtle)]">%</span></span>
            <span className="mb-2 text-[12.5px] text-[var(--color-fg-muted)]">das entregas com GPS</span>
          </div>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
            <div style={{ width: `${pctGps}%`, background: 'var(--color-accent)' }} className="transition-all duration-700" />
            <div style={{ width: `${100 - pctGps}%`, background: 'var(--color-danger)' }} className="opacity-70 transition-all duration-700" />
          </div>
          <div className="mt-2.5 flex justify-between text-[11.5px] text-[var(--color-fg-muted)]">
            <span className="text-numeric">{m.com_rastreador} com GPS</span>
            <span className="text-numeric">{m.sem_rastreador} sem rastreador</span>
          </div>
        </Painel>

        <Painel titulo="Tempo médio em loja" className="lg:col-span-2">
          <div className="text-display text-[44px] text-[var(--color-fg)]">{fmtH(m.tempoMedioLojaMin)}</div>
          <div className="mt-4 space-y-2">
            {(['madrugada', 'manha', 'tarde', 'noite'] as const).map(t => {
              const max = Math.max(1, ...Object.values(m.turnos))
              const label = { madrugada: 'Madrugada', manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }[t]
              return (
                <div key={t} className="flex items-center gap-2.5">
                  <span className="w-[68px] text-[11px] text-[var(--color-fg-subtle)]">{label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${100 * m.turnos[t] / max}%`, background: 'var(--color-accent)', opacity: 0.55 }} />
                  </div>
                  <span className="w-7 text-right text-numeric text-[11px] text-[var(--color-fg-muted)]">{m.turnos[t]}</span>
                </div>
              )
            })}
          </div>
        </Painel>
      </section>

      {/* Tabela por rede */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">Desempenho por rede</h3>
          {m.pctSemRastreador > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-fg-muted)]">
              <WifiSlash size={13} weight="bold" style={{ color: 'var(--color-danger)' }} />
              <span className="text-numeric" style={{ color: 'var(--color-danger)' }}>{m.pctSemRastreador}%</span> sem rastreador no total
            </span>
          )}
        </div>
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-soft">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-fg-subtle)]">
                <th className="px-5 py-3 font-semibold">Rede</th>
                <th className="px-4 py-3 text-right font-semibold">Entregues</th>
                <th className="px-4 py-3 text-right font-semibold">Não foi</th>
                <th className="px-4 py-3 text-right font-semibold">Sem rastr.</th>
                <th className="px-4 py-3 text-right font-semibold">Taxa</th>
                <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Tempo méd.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {m.porRede.map(r => (
                <tr key={r.rede_id} className="transition-colors hover:bg-[var(--color-bg-subtle)]">
                  <td className="px-5 py-3">
                    <div className="font-medium text-[var(--color-fg)]">{REDE_LABEL[r.rede_id] ?? r.rede_id}</div>
                    <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                      <div className="h-full rounded-full" style={{ width: `${r.pctEntregue}%`, background: 'var(--color-success)' }} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-numeric" style={{ color: 'var(--color-success)' }}>{r.entregue}</td>
                  <td className="px-4 py-3 text-right text-numeric" style={{ color: r.nao_foi ? 'var(--color-warning)' : 'var(--color-fg-subtle)' }}>{r.nao_foi}</td>
                  <td className="px-4 py-3 text-right text-numeric" style={{ color: r.sem_rastreador ? 'var(--color-danger)' : 'var(--color-fg-subtle)' }}>{r.sem_rastreador}</td>
                  <td className="px-4 py-3 text-right text-numeric font-semibold text-[var(--color-fg)]">{r.pctEntregue}%</td>
                  <td className="hidden px-5 py-3 text-right text-numeric text-[var(--color-fg-muted)] sm:table-cell">{r.tempoMedioMin != null ? `${r.tempoMedioMin}m` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Export mensal por rede */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1.5 text-[11.5px] text-[var(--color-fg-subtle)]">
            <CheckCircle size={13} weight="bold" /> Baixar mês {mes}:
          </span>
          {m.porRede.map(r => (
            <a key={r.rede_id} href={`/api/dashboard/export-mensal?rede=${r.rede_id}&mes=${mes}`}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-fg-muted)] transition-all duration-150 active:scale-[0.96] hover:border-[var(--color-navy-700)] hover:text-[var(--color-accent)]">
              {REDE_LABEL[r.rede_id] ?? r.rede_id}
            </a>
          ))}
        </div>
      </section>

      {/* Listas top */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ListaTop titulo="Top lojas sem rastreador" cor={STATUS.sem_rastreador.cor}
          itens={m.topSemRastreador.map(x => ({ nome: `${REDE_LABEL[x.rede_id] ?? x.rede_id} · ${x.loja}`, valor: x.ocorrencias }))} />
        <ListaTop titulo="Top lojas “não foi ao cliente”" cor={STATUS.nao_foi.cor}
          itens={m.topNaoFoi.map(x => ({ nome: `${REDE_LABEL[x.rede_id] ?? x.rede_id} · ${x.loja}`, valor: x.ocorrencias }))} />
      </section>
    </div>
  )
}

function Metric({ valor, label, sub, cor, destaque }: { valor: string | number; label: string; sub?: string; cor?: string; destaque?: boolean }) {
  return (
    <div className="p-5 sm:p-6">
      <div className="text-display text-[40px]" style={{ color: destaque ? 'var(--color-fg)' : (cor ?? 'var(--color-fg)') }}>{valor}</div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fg-muted)]">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--color-fg-subtle)]">{sub}</div>}
    </div>
  )
}

function Painel({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 shadow-soft animate-fade-up ${className ?? ''}`}>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">{titulo}</h3>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function ListaTop({ titulo, itens, cor }: { titulo: string; itens: Array<{ nome: string; valor: number }>; cor: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 shadow-soft">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">{titulo}</h3>
      {itens.length === 0 ? (
        <p className="mt-4 text-[13px] text-[var(--color-fg-muted)]">Nada no período.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--color-border)]">
          {itens.slice(0, 8).map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="w-4 shrink-0 text-numeric text-[11px] text-[var(--color-fg-subtle)]">{i + 1}</span>
                <span className="truncate text-[var(--color-fg)]">{it.nome}</span>
              </span>
              <span className="shrink-0 text-numeric font-semibold" style={{ color: cor }}>{it.valor}×</span>
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
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 shadow-soft animate-fade-up">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">Entregas por dia</h3>
        <div className="flex gap-3.5 text-[11px] text-[var(--color-fg-muted)]">
          {(['entregue', 'nao_foi', 'sem_rastreador'] as const).map(k => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS[k].cor }} />{STATUS[k].label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-1" style={{ height: 168 }}>
        {serie.map(s => (
          <div key={s.data} className="group flex flex-1 flex-col items-center gap-1.5" title={`${s.data}: ${s.total} entregas`}>
            <div className="flex w-full flex-col justify-end overflow-hidden rounded-[3px] transition-opacity group-hover:opacity-80" style={{ height: 138 }}>
              <div className="w-full transition-all duration-500" style={{ height: `${138 * s.sem_rastreador / max}px`, background: STATUS.sem_rastreador.cor, opacity: 0.85 }} />
              <div className="w-full transition-all duration-500" style={{ height: `${138 * s.nao_foi / max}px`, background: STATUS.nao_foi.cor, opacity: 0.85 }} />
              <div className="w-full transition-all duration-500" style={{ height: `${138 * s.entregue / max}px`, background: STATUS.entregue.cor, opacity: 0.9 }} />
            </div>
            <span className="text-numeric text-[9px] text-[var(--color-fg-subtle)]">{s.data.slice(8, 10)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
