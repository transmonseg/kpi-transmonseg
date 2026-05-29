'use client'

import Link from 'next/link'
import {
  ArrowUpRight,
  ClockCounterClockwise,
  Sparkle,
} from '@phosphor-icons/react/dist/ssr'

export type SerieDiaria = { data: string; rotas: number; semGps: number; cobertura: number }

export type ResumoOperacaoData = {
  hojeFormatado: string
  geracoesHoje: number
  ultimaGeracao: { totalRotas: number; redes: number; relativo: string } | null
  serie14d: SerieDiaria[]
}

export default function ResumoOperacao({ r }: { r: ResumoOperacaoData }) {
  return (
    <section className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
          Operação · <span className="capitalize text-[var(--color-fg-muted)]">{r.hojeFormatado}</span>
        </h2>
        <Link
          href="/painel/kpi/simples"
          className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-accent)]"
        >
          <Sparkle size={12} weight="fill" /> Gerar KPI
          <ArrowUpRight size={13} weight="bold" className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Sparkline cobertura GPS — destaque */}
        <div className="lg:col-span-8">
          <CoberturaSparkline serie={r.serie14d} />
        </div>

        {/* Última geração */}
        <Link
          href="/painel/historico"
          className="group flex flex-col justify-between rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-soft transition-all duration-200 active:scale-[0.98] hover:border-[var(--color-border-strong)] lg:col-span-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">
              <ClockCounterClockwise size={12} weight="bold" /> Última geração
            </div>
            <ArrowUpRight size={14} weight="bold" className="text-[var(--color-fg-subtle)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--color-fg)]" />
          </div>
          {r.ultimaGeracao ? (
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-display text-[34px] leading-none text-[var(--color-fg)]">{r.ultimaGeracao.totalRotas}</span>
                <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-muted)]">
                  rotas · {r.ultimaGeracao.redes} rede{r.ultimaGeracao.redes === 1 ? '' : 's'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">{r.ultimaGeracao.relativo}</p>
            </div>
          ) : (
            <p className="mt-4 text-[12px] text-[var(--color-fg-muted)]">Nenhuma geração ainda</p>
          )}
        </Link>
      </div>
    </section>
  )
}

function CoberturaSparkline({ serie }: { serie: SerieDiaria[] }) {
  const W = 720, H = 60, padX = 4
  const innerW = W - padX * 2
  const step = serie.length > 1 ? innerW / (serie.length - 1) : 0
  const yOf = (c: number) => H - (c / 100) * H

  const points = serie.map((d, i) => ({
    x: padX + i * step,
    y: d.rotas > 0 ? yOf(d.cobertura) : H + 8,
    d,
  }))

  const segments: string[] = []
  let started = false
  for (const p of points) {
    if (p.d.rotas === 0) { started = false; continue }
    segments.push(started ? `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    started = true
  }
  const linePath = segments.join(' ')

  let areaPath = ''
  if (segments.length > 0) {
    const first = points.find(p => p.d.rotas > 0)
    const last = [...points].reverse().find(p => p.d.rotas > 0)
    if (first && last) areaPath = `${linePath} L ${last.x.toFixed(1)} ${H} L ${first.x.toFixed(1)} ${H} Z`
  }

  const ultima = [...serie].reverse().find(d => d.rotas > 0)?.cobertura ?? null
  const validos = serie.filter(d => d.rotas > 0)
  const media = validos.length ? Math.round(validos.reduce((s, d) => s + d.cobertura, 0) / validos.length) : null

  const cor = ultima === null ? 'var(--color-fg-subtle)' : ultima >= 80 ? 'var(--color-success)' : ultima >= 50 ? 'var(--color-warning)' : 'var(--color-danger)'

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-soft">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">Cobertura GPS · 14 dias</span>
        <div className="flex items-baseline gap-2.5">
          <span className="text-display text-[30px] leading-none" style={{ color: cor }}>{ultima !== null ? `${ultima}%` : '—'}</span>
          {media !== null && <span className="text-[11px] text-[var(--color-fg-muted)]">média <span className="text-numeric font-semibold text-[var(--color-fg)]">{media}%</span></span>}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="block w-full" role="img" aria-label="Cobertura GPS por dia" preserveAspectRatio="none">
        <line x1={padX} x2={W - padX} y1={yOf(80)} y2={yOf(80)} stroke="var(--color-border)" strokeDasharray="3 4" strokeWidth={1} />
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={cor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill="url(#spark-grad)" />}
        {linePath && <path d={linePath} fill="none" stroke={cor} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />}
        {points.map((p, i) => p.d.rotas > 0 && (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={2.5} fill="var(--color-bg-elevated)" stroke={cor} strokeWidth={1.5} />
            <title>{p.d.data} · {p.d.cobertura}% ({p.d.rotas - p.d.semGps}/{p.d.rotas} rotas)</title>
          </g>
        ))}
        <text x={padX} y={H + 12} fontSize="9" fill="var(--color-fg-subtle)" fontFamily="monospace">{serie[0]?.data.slice(5) ?? ''}</text>
        <text x={W - padX} y={H + 12} fontSize="9" fill="var(--color-fg-subtle)" fontFamily="monospace" textAnchor="end">hoje</text>
      </svg>
    </div>
  )
}
