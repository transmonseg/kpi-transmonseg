'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Metricas } from '@/lib/kpi/dashboard-metricas'
import { REDES, REDE_LABEL } from '@/lib/kpi/redes'
import InserirManual from './inserir-manual'
import Historico from './historico'
import ResumoOperacao, { type ResumoOperacaoData } from './resumo-operacao'
import { hojeBR } from '@/lib/data-br'
import { ArrowSquareOut, CheckCircle, WarningCircle, ArrowClockwise } from '@phosphor-icons/react/dist/ssr'

type Periodo = 'dia' | 'semana' | 'mes'
type Tab = 'geral' | 'inserir' | 'historico'

const hoje = () => hojeBR()

// status → token semântico (sem cores hardcoded)
const STATUS = {
  entregue:       { label: 'Entregues',      cor: 'var(--color-success)' },
  nao_foi:        { label: 'Não foi',        cor: 'var(--color-warning)' },
  sem_rastreador: { label: 'Sem rastreador', cor: 'var(--color-danger)'  },
} as const

// semáforo discreto
const COR = { ok: 'var(--color-success)', warn: 'var(--color-warning)', bad: 'var(--color-danger)' } as const
const tomTaxa  = (p: number) => p >= 95 ? 'ok' : p >= 80 ? 'warn' : 'bad'
const tomFalha = (p: number) => p <= 5 ? 'ok' : p <= 10 ? 'warn' : 'bad'
const tomGps   = (p: number) => p >= 90 ? 'ok' : p >= 50 ? 'warn' : 'bad'

// botão secundário canônico (h-9), sem text-white hardcoded
const BTN_SEC = 'inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3.5 text-[13px] font-medium text-[var(--color-fg)] shadow-soft transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)]'
// link-chip compacto (download)
const CHIP_LINK = 'rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-fg-muted)] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
const CARD = 'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-soft'

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
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (tab !== 'geral') return
    setCarregando(true)
    const qs = new URLSearchParams({ periodo, data, redes: redes.join(',') })
    fetch(`/api/dashboard?${qs}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(j => { setM(j.metricas); setIntervalo(j.intervalo); setErro(false) })
      .catch(() => { setM(null); setErro(true) })
      .finally(() => setCarregando(false))
  }, [tab, periodo, data, redes])

  const mesAtual = data.slice(0, 7)
  const recarregar = () => setRedes(r => [...r])

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-overline">Operação</span>
          <h1 className="mt-1 text-display text-[30px] leading-none text-[var(--color-fg)]">Dashboard</h1>
          <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
            Entregas, rastreamento e desempenho por rede, consolidado a partir dos KPIs inseridos.
          </p>
        </div>
        {tab === 'geral' && (
          <button
            onClick={() => window.open(`/painel/dashboard/print?periodo=${periodo}&data=${data}&redes=${redes.join(',')}`, '_blank')}
            className={BTN_SEC}
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
              'relative px-4 py-2.5 text-[13px] font-medium transition-[color,transform] duration-150 active:scale-[0.98]',
              tab === t ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]',
            ].join(' ')}
          >
            {label}
            <span
              aria-hidden
              className={`absolute inset-x-2 -bottom-px h-0.5 origin-left rounded-full bg-[var(--color-accent)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${tab === t ? 'scale-x-100' : 'scale-x-0'}`}
            />
          </button>
        ))}
      </nav>

      <div className="py-8">
        {tab === 'inserir' && <div key="inserir" className="animate-fade-up"><InserirManual data={data} onChange={setData} /></div>}
        {tab === 'historico' && <div key="historico" className="animate-fade-up"><Historico onAbrirDia={(d) => { setData(d); setPeriodo('dia'); setTab('geral') }} /></div>}
        {tab === 'geral' && (
          <div className="space-y-12">
            {resumo && <ResumoOperacao r={resumo} />}
            <VisaoGeral
              periodo={periodo} setPeriodo={setPeriodo} data={data} setData={setData}
              redes={redes} setRedes={setRedes} m={m} intervalo={intervalo}
              carregando={carregando} erro={erro} onRetry={recarregar} mes={mesAtual}
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
  m: Metricas | null; intervalo: [string, string] | null
  carregando: boolean; erro: boolean; onRetry: () => void; mes: string
}) {
  const { periodo, setPeriodo, data, setData, redes, setRedes, m, intervalo, carregando, erro, onRetry, mes } = props
  const toggleRede = (r: string) => setRedes(redes.includes(r) ? redes.filter(x => x !== r) : [...redes, r])

  return (
    <div className="space-y-10">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0.5 shadow-soft">
          {(['dia', 'semana', 'mes'] as Periodo[]).map(p => (
            <button
              key={p} onClick={() => setPeriodo(p)}
              className={[
                'h-8 rounded-[var(--radius-sm)] px-3.5 text-[12px] font-medium capitalize transition-[background-color,color,transform] duration-150 active:scale-[0.97]',
                periodo === p ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-soft' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              ].join(' ')}
            >{p === 'mes' ? 'Mês' : p}</button>
          ))}
        </div>
        <input
          type="date" value={data} onChange={e => setData(e.target.value)}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-fg)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
        />
        {intervalo && (
          <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">{intervalo[0]} → {intervalo[1]}</span>
        )}
      </div>

      {/* Chips de rede */}
      <div className="flex flex-wrap gap-1.5">
        <Chip ativo={redes.length === 0} onClick={() => setRedes([])}>Todas</Chip>
        {REDES.map(r => (
          <Chip key={r} ativo={redes.includes(r)} onClick={() => toggleRede(r)}>{REDE_LABEL[r] ?? r}</Chip>
        ))}
      </div>

      {carregando ? <Skeleton /> : erro ? <Erro onRetry={onRetry} /> : !m || m.total === 0 ? <Vazio /> : (
        <Conteudo key={`${periodo}-${data}-${redes.join(',')}`} m={m} mes={mes} />
      )}
    </div>
  )
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1 text-[12px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]',
        ativo
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-fg)]'
          : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
      ].join(' ')}
    >{children}</button>
  )
}

function Skeleton() {
  // espelha o layout real: 4 hero tiles + barra + bloco de conteúdo
  return (
    <div className="space-y-12">
      <div className={`grid grid-cols-2 overflow-hidden divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0 ${CARD}`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-5 sm:p-6">
            <div className="h-9 w-20 rounded animate-shimmer" />
            <div className="mt-3 h-2.5 w-24 rounded animate-shimmer" />
          </div>
        ))}
      </div>
      <div className="h-2.5 w-full rounded-full animate-shimmer" />
      <div className="h-[240px] rounded-[var(--radius-card)] animate-shimmer" />
    </div>
  )
}

function Vazio() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] py-20 text-center animate-fade-up">
      <WarningCircle size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
      <div className="mt-3 text-[14px] font-semibold text-[var(--color-fg)]">Sem dados neste período</div>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
        Insira os KPIs do dia na aba <span className="font-medium text-[var(--color-fg)]">Inserir KPIs</span> para ver as análises aqui.
      </p>
    </div>
  )
}

function Erro({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] py-20 text-center animate-fade-up">
      <WarningCircle size={28} weight="fill" style={{ color: 'var(--color-danger)' }} />
      <div className="mt-3 text-[14px] font-semibold text-[var(--color-fg)]">Não foi possível carregar</div>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[var(--color-fg-muted)]">Houve uma falha ao buscar as métricas. Tente novamente.</p>
      <button onClick={onRetry} className={`mt-4 ${BTN_SEC}`}>
        <ArrowClockwise size={14} weight="bold" /> Tentar de novo
      </button>
    </div>
  )
}

function Conteudo({ m, mes }: { m: Metricas; mes: string }) {
  const pctGps = m.total ? Math.round(100 * m.com_rastreador / m.total) : 0
  const pctFalha = m.total ? Math.round(100 * m.nao_foi / m.total) : 0

  const problema = useMemo(() => {
    const map = new Map<string, { rede_id: string; loja: string; sem: number; nao: number }>()
    const get = (r: string, l: string) => {
      const k = `${r}|${l}`; let e = map.get(k)
      if (!e) { e = { rede_id: r, loja: l, sem: 0, nao: 0 }; map.set(k, e) }
      return e
    }
    for (const x of m.topSemRastreador) get(x.rede_id, x.loja).sem = x.ocorrencias
    for (const x of m.topNaoFoi) get(x.rede_id, x.loja).nao = x.ocorrencias
    return [...map.values()].sort((a, b) => (b.sem + b.nao) - (a.sem + a.nao)).slice(0, 10)
  }, [m])

  return (
    <div className="space-y-12">
      {/* ───────── FAIXA 1 — RESUMO ───────── */}
      <section className="space-y-3 animate-fade-up">
        <div className={`grid grid-cols-2 overflow-hidden divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0 ${CARD}`}>
          <HeroTile i={0} valor={`${m.pctEntregue}%`} label="Taxa de entrega" status={tomTaxa(m.pctEntregue)} nota="meta ≥ 95%" />
          <HeroTile i={1} valor={`${pctFalha}%`} label="Não foi ao cliente" status={tomFalha(pctFalha)} nota={`${m.nao_foi} de ${m.total}`} />
          <HeroTile i={2} valor={`${pctGps}%`} label="Cobertura GPS" status={tomGps(pctGps)} nota={`${m.sem_rastreador} sem rastreador`} />
          <HeroTile i={3} valor={fmtH(m.tempoMedioLojaMin)} label="Tempo médio em loja" nota="média do período" />
        </div>
        {/* barra empilhada 100% do mix de status */}
        <div className="flex items-center gap-3">
          <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
            {(['entregue', 'nao_foi', 'sem_rastreador'] as const).map(k => (
              <Tip key={k} label={`${STATUS[k].label}: ${m[k]}`}>
                <div className="h-full" style={{ width: `${100 * m[k] / (m.total || 1)}%`, background: STATUS[k].cor }} />
              </Tip>
            ))}
          </div>
          <div className="flex shrink-0 gap-3 text-[10px] text-[var(--color-fg-muted)]">
            {(['entregue', 'nao_foi', 'sem_rastreador'] as const).map(k => (
              <span key={k} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS[k].cor }} />
                <span className="text-numeric">{m[k]}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── FAIXA 2 — ONDE AGIR AGORA ───────── */}
      <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        <h2 className="mb-3 text-overline">Onde agir agora</h2>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className={`overflow-hidden lg:col-span-3 ${CARD}`}>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">
                  <th className="px-5 py-3 font-semibold">Loja com mais problema</th>
                  <th className="px-3 py-3 text-right font-semibold">Sem GPS</th>
                  <th className="px-3 py-3 text-right font-semibold">Não foi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {problema.length === 0 && (
                  <tr><td colSpan={3} className="px-5 py-8 text-center text-[13px] text-[var(--color-fg-muted)]">Nenhuma ocorrência no período 🎉</td></tr>
                )}
                {problema.map((p, i) => (
                  <tr key={i} className="transition-colors hover:bg-[var(--color-bg-subtle)]">
                    <td className="px-5 py-3">
                      <div className="max-w-[260px] truncate font-medium text-[var(--color-fg)]">{p.loja}</div>
                      <div className="text-[11px] text-[var(--color-fg-subtle)]">{REDE_LABEL[p.rede_id] ?? p.rede_id}</div>
                    </td>
                    <td className="px-3 py-3 text-right text-numeric" style={{ color: p.sem ? 'var(--color-danger)' : 'var(--color-fg-subtle)' }}>{p.sem || '—'}</td>
                    <td className="px-3 py-3 text-right text-numeric" style={{ color: p.nao ? 'var(--color-warning)' : 'var(--color-fg-subtle)' }}>{p.nao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-5 lg:col-span-2 lg:grid-cols-1">
            <Painel titulo="Sem rastreador">
              <div className="flex items-end gap-2">
                <span className="text-display text-numeric text-[40px] leading-none" style={{ color: m.pctSemRastreador > 10 ? 'var(--color-danger)' : 'var(--color-fg)' }}>{m.sem_rastreador}</span>
                <span className="mb-1.5 text-numeric text-[12px] text-[var(--color-fg-muted)]">{m.pctSemRastreador}% do total</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">entregas sem registro de GPS — geralmente placa sem rastreador ou cadastro do Unitrac.</p>
            </Painel>
            <Painel titulo="Não foi ao cliente">
              <div className="flex items-end gap-2">
                <span className="text-display text-numeric text-[40px] leading-none" style={{ color: pctFalha > 10 ? 'var(--color-warning)' : 'var(--color-fg)' }}>{m.nao_foi}</span>
                <span className="mb-1.5 text-numeric text-[12px] text-[var(--color-fg-muted)]">{pctFalha}% do total</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">programadas que o veículo não chegou a entregar.</p>
            </Painel>
          </div>
        </div>
      </section>

      {/* ───────── FAIXA 3 — CONTEXTO ───────── */}
      <section className="space-y-5 animate-fade-up" style={{ animationDelay: '160ms' }}>
        <h2 className="text-overline">Contexto e distribuição</h2>
        {m.serie.length > 1 && <SerieChart serie={m.serie} />}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <PorRede redes={m.porRede} />
          <Painel titulo="Volume por turno">
            <div className="space-y-2.5 pt-1">
              {(['madrugada', 'manha', 'tarde', 'noite'] as const).map(t => {
                const max = Math.max(1, ...Object.values(m.turnos))
                const label = { madrugada: 'Madrugada', manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }[t]
                return (
                  <div key={t} className="flex items-center gap-2.5">
                    <span className="w-24 shrink-0 text-[12px] text-[var(--color-fg-muted)]">{label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                      <div className="h-full w-full origin-left rounded-full" style={{ transform: `scaleX(${m.turnos[t] / max})`, transition: 'transform 0.7s cubic-bezier(0.16,1,0.3,1)', background: 'var(--color-accent)', opacity: 0.6 }} />
                    </div>
                    <span className="w-10 text-right text-numeric text-[11px] text-[var(--color-fg-muted)]">{m.turnos[t]}</span>
                  </div>
                )
              })}
            </div>
          </Painel>
        </div>

        {/* Export mensal por rede */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1.5 text-[11px] text-[var(--color-fg-subtle)]">
            <CheckCircle size={13} weight="bold" /> Baixar KPI mensal ({mes}):
          </span>
          {m.porRede.map(r => (
            <a key={r.rede_id} href={`/api/dashboard/export-mensal?rede=${r.rede_id}&mes=${mes}`} className={CHIP_LINK}>
              {REDE_LABEL[r.rede_id] ?? r.rede_id}
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}

// tooltip CSS-only (substitui title nativo)
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group/tip relative h-full">
      {children}
      <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 scale-95 whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1 text-numeric text-[10px] text-[var(--color-fg)] opacity-0 shadow-soft transition-[opacity,transform] duration-150 group-hover/tip:scale-100 group-hover/tip:opacity-100">
        {label}
      </span>
    </div>
  )
}

function HeroTile({ i, valor, label, status, nota }: { i: number; valor: string | number; label: string; status?: 'ok' | 'warn' | 'bad'; nota?: string }) {
  const alerta = status && status !== 'ok'
  return (
    <div className="p-5 sm:p-6 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
      <div className="text-display text-numeric text-[40px] text-[var(--color-fg)]">{valor}</div>
      <div className="mt-2 flex items-center gap-1.5">
        <div className="text-overline">{label}</div>
        {alerta && <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR[status!] }} />}
      </div>
      {nota && <div className="mt-0.5 text-[11px]" style={{ color: alerta ? COR[status!] : 'var(--color-fg-subtle)' }}>{nota}</div>}
    </div>
  )
}

function Painel({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up ${className ?? ''}`}>
      <h3 className="text-overline">{titulo}</h3>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function PorRede({ redes }: { redes: Metricas['porRede'] }) {
  const max = Math.max(1, ...redes.map(r => r.total))
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <h3 className="text-overline">Desempenho por rede</h3>
      <div className="mt-4 space-y-2">
        {redes.map(r => (
          <div key={r.rede_id} className="flex items-center gap-2.5">
            <span className="w-24 shrink-0 truncate text-[12px] text-[var(--color-fg)]" title={REDE_LABEL[r.rede_id] ?? r.rede_id}>{REDE_LABEL[r.rede_id] ?? r.rede_id}</span>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-[var(--color-bg-subtle)] ring-1 ring-inset ring-[var(--color-border)]">
              <div className="absolute inset-y-0 left-0 w-full origin-left rounded" style={{ transform: `scaleX(${r.total / max})`, transition: 'transform 0.7s cubic-bezier(0.16,1,0.3,1)', background: 'var(--color-accent-soft)' }} />
              <div className="absolute inset-y-0 left-0 w-full origin-left rounded" style={{ transform: `scaleX(${r.entregue / max})`, transition: 'transform 0.7s cubic-bezier(0.16,1,0.3,1)', background: 'var(--color-success)' }} />
            </div>
            <span className="w-10 text-right text-numeric text-[11px] font-semibold text-[var(--color-fg)]">{r.pctEntregue}%</span>
            <span className="w-7 text-right text-numeric text-[11px] text-[var(--color-fg-subtle)]">{r.total}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SerieChart({ serie }: { serie: Metricas['serie'] }) {
  const max = useMemo(() => Math.max(1, ...serie.map(s => s.total)), [serie])
  return (
    <div className={`${CARD} p-5 sm:p-6 animate-fade-up`}>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-overline">Entregas por dia</h3>
        <div className="flex gap-3 text-[11px] text-[var(--color-fg-muted)]">
          {(['entregue', 'nao_foi', 'sem_rastreador'] as const).map(k => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS[k].cor }} />{STATUS[k].label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-1" style={{ height: 168 }}>
        {serie.map(s => (
          <Tip key={s.data} label={`${s.data.slice(8, 10)}/${s.data.slice(5, 7)} · ${s.total} entregas`}>
            <div className="flex h-full w-full flex-col items-center justify-end gap-1.5">
              <div className="flex w-full flex-col justify-end overflow-hidden rounded-[3px] transition-opacity group-hover/tip:opacity-80" style={{ height: 138 }}>
                <div className="w-full" style={{ height: `${138 * s.sem_rastreador / max}px`, background: STATUS.sem_rastreador.cor, opacity: 0.85 }} />
                <div className="w-full" style={{ height: `${138 * s.nao_foi / max}px`, background: STATUS.nao_foi.cor, opacity: 0.85 }} />
                <div className="w-full" style={{ height: `${138 * s.entregue / max}px`, background: STATUS.entregue.cor, opacity: 0.9 }} />
              </div>
              <span className="text-numeric text-[9px] text-[var(--color-fg-muted)]">{s.data.slice(8, 10)}</span>
            </div>
          </Tip>
        ))}
      </div>
    </div>
  )
}
