'use client'

import { useEffect, useRef, useState } from 'react'

// ---------- formatadores ----------
export const fmtNum = (n: number | null | undefined): string =>
  n == null || isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export const fmtMin = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return '—'
  const h = Math.floor(n / 60)
  const m = Math.round(n % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

type Tone = 'accent' | 'danger' | 'warning' | 'success' | 'info' | 'muted'
const TONE: Record<Tone, string> = {
  accent: 'var(--color-accent)',
  danger: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  success: 'var(--color-success)',
  info: 'var(--color-info)',
  muted: 'var(--color-navy-300)',
}

// Mede a largura do container (responsivo) sem quebrar no SSR.
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(e.contentRect.width)
    })
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

// ---------- Donut: rosca (mix de status, participação por rede) ----------
export interface DonutSlice { label: string; value: number; color: string }

export function Donut({
  slices,
  size = 180,
  thickness = 20,
  centerValue,
  centerLabel,
  format = fmtNum,
}: {
  slices: DonutSlice[]
  size?: number
  thickness?: number
  centerValue?: string
  centerLabel?: string
  format?: (n: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const total = slices.reduce((s, x) => s + x.value, 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const cx = size / 2
  let acc = 0
  const segs = slices.map((s, i) => {
    const frac = s.value / total
    const seg = { ...s, i, frac, offset: acc }
    acc += frac
    return seg
  })
  const hv = hover != null ? segs[hover] : null
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-bg-subtle)" strokeWidth={thickness} />
          {segs.map(s => (
            <circle
              key={s.i}
              cx={cx} cy={cx} r={r} fill="none"
              stroke={s.color}
              strokeWidth={hover === s.i ? thickness + 3 : thickness}
              strokeDasharray={`${s.frac * c} ${c}`}
              strokeDashoffset={-s.offset * c}
              className="transition-[stroke-width] duration-150"
              style={{ opacity: hover == null || hover === s.i ? 1 : 0.45, cursor: 'default' }}
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-display text-numeric text-[26px] leading-none text-[var(--color-fg)]">
            {hv ? format(hv.value) : centerValue ?? format(total)}
          </span>
          <span className="mt-1 max-w-[80%] text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-subtle)]">
            {hv ? hv.label : centerLabel ?? 'total'}
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {segs.map(s => (
          <li
            key={s.i}
            className="flex items-center justify-between gap-2 text-[12.5px]"
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="flex min-w-0 items-center gap-2 text-[var(--color-fg-muted)]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              <span className="truncate" title={s.label}>{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-[var(--color-fg)]">
              <span className="font-semibold">{format(s.value)}</span>
              <span className="ml-1 text-[11px] text-[var(--color-fg-subtle)]">{Math.round(s.frac * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- Gauge: medidor radial (taxa de entrega, cobertura) ----------
export function Gauge({
  value,
  label,
  sub,
  color = 'var(--color-accent)',
  size = 180,
}: {
  value: number // 0..100
  label?: string
  sub?: string
  color?: string
  size?: number
}) {
  const thickness = 14
  const r = (size - thickness) / 2
  const cx = size / 2
  const sweep = 0.75 // 270°
  const c = 2 * Math.PI * r
  const arc = c * sweep
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size * 0.82 }}>
        {/* gira -225° pra abrir o arco embaixo (gap de 90°) */}
        <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-bg-subtle)" strokeWidth={thickness}
            strokeLinecap="round" strokeDasharray={`${arc} ${c}`} />
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={thickness}
            strokeLinecap="round" strokeDasharray={`${arc * (v / 100)} ${c}`}
            className="transition-[stroke-dasharray] duration-700 ease-out" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-display text-numeric leading-none text-[var(--color-fg)]" style={{ fontSize: size * 0.26 }}>
            {Math.round(v)}<span className="text-[0.5em] text-[var(--color-fg-subtle)]">%</span>
          </span>
          {label && <span className="mt-1 text-overline">{label}</span>}
        </div>
      </div>
      {sub && <div className="-mt-1 text-[11px] text-[var(--color-fg-subtle)]">{sub}</div>}
    </div>
  )
}

// ---------- Heatmap: grade dia × rede (taxa de entrega) ----------
export interface HeatRow { key: string; label: string; cells: ({ value: number | null; n?: number })[] }

// escala vermelho→amarelo→verde para % (0..100). null = cinza (sem dado).
function heatColor(v: number | null): string {
  if (v == null) return 'var(--color-bg-subtle)'
  if (v >= 95) return 'var(--color-success)'
  if (v >= 85) return 'color-mix(in srgb, var(--color-success) 55%, var(--color-warning))'
  if (v >= 70) return 'var(--color-warning)'
  if (v >= 50) return 'color-mix(in srgb, var(--color-warning) 55%, var(--color-danger))'
  return 'var(--color-danger)'
}

export function Heatmap({
  colLabels,
  rows,
  format = (n) => `${Math.round(n)}%`,
}: {
  colLabels: string[]
  rows: HeatRow[]
  format?: (n: number) => string
}) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null)
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[480px]">
        <div className="flex gap-[3px] pl-[92px]">
          {colLabels.map((lb, i) => (
            <div key={i} className="flex-1 text-center text-[9px] tabular-nums text-[var(--color-fg-subtle)]">{lb}</div>
          ))}
        </div>
        <div className="mt-1 space-y-[3px]">
          {rows.map((row, ri) => (
            <div key={row.key} className="flex items-center gap-[3px]">
              <div className="w-[89px] shrink-0 truncate pr-2 text-right text-[11px] text-[var(--color-fg-muted)]" title={row.label}>{row.label}</div>
              {row.cells.map((cell, ci) => {
                const on = hover?.r === ri && hover?.c === ci
                return (
                  <div
                    key={ci}
                    onMouseEnter={() => setHover({ r: ri, c: ci })}
                    onMouseLeave={() => setHover(null)}
                    className="relative aspect-square flex-1 rounded-[3px] transition-transform duration-100"
                    style={{ background: heatColor(cell.value), opacity: cell.value == null ? 0.5 : 0.9, transform: on ? 'scale(1.15)' : 'none', zIndex: on ? 5 : 0 }}
                  >
                    {on && cell.value != null && (
                      <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--color-fg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-bg-elevated)] shadow-soft">
                        {colLabels[ci]} · {format(cell.value)}{cell.n != null ? ` (${cell.n})` : ''}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 pl-[92px] text-[10px] text-[var(--color-fg-subtle)]">
          <span>pior</span>
          {['var(--color-danger)', 'color-mix(in srgb, var(--color-warning) 55%, var(--color-danger))', 'var(--color-warning)', 'color-mix(in srgb, var(--color-success) 55%, var(--color-warning))', 'var(--color-success)'].map((c, i) => (
            <span key={i} className="h-2.5 w-5 rounded-[2px]" style={{ background: c }} />
          ))}
          <span>melhor</span>
        </div>
      </div>
    </div>
  )
}

// ---------- BarList: barras horizontais (rankings, comparativos) ----------
export interface BarItem {
  key: string
  label: string
  value: number
  sub?: string
  tone?: Tone
}

export function BarList({
  items,
  format = fmtNum,
  showRank = false,
  maxValue,
  hrefDe,
}: {
  items: BarItem[]
  format?: (n: number) => string
  showRank?: boolean
  maxValue?: number
  hrefDe?: (item: BarItem) => string
}) {
  const max = maxValue ?? Math.max(...items.map(i => i.value), 1)
  return (
    <ol className="space-y-3">
      {items.map((it, i) => (
        <li key={it.key} className="group">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2">
              {showRank && (
                <span
                  className={
                    'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums ' +
                    (i < 3
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-fg)]'
                      : 'bg-[var(--color-bg-subtle)] text-[var(--color-fg-subtle)]')
                  }
                >
                  {i + 1}
                </span>
              )}
              {hrefDe ? (
                <a
                  href={hrefDe(it)}
                  className="truncate text-[var(--color-fg)] transition-colors hover:text-[var(--color-accent)] hover:underline"
                  title={it.label}
                >
                  {it.label}
                </a>
              ) : (
                <span className="truncate text-[var(--color-fg)]" title={it.label}>
                  {it.label}
                </span>
              )}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-[var(--color-fg)]">{format(it.value)}</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${(it.value / max) * 100}%`, background: TONE[it.tone ?? 'accent'] }}
            />
          </div>
          {it.sub && <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">{it.sub}</div>}
        </li>
      ))}
    </ol>
  )
}

// ---------- ColumnChart: barras verticais (volume diário, distribuição horária) ----------
export interface ColumnItem {
  label: string
  value: number
}

export function ColumnChart({
  items,
  format = fmtNum,
  height = 220,
  highlightIndex,
  labelEvery = 1,
}: {
  items: ColumnItem[]
  format?: (n: number) => string
  height?: number
  highlightIndex?: number
  labelEvery?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...items.map(i => i.value), 1)
  const active = hover ?? highlightIndex ?? null
  return (
    <div>
      <div className="relative flex items-end gap-[3px]" style={{ height }}>
        {items.map((it, i) => {
          const isActive = i === active
          return (
            <div
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="relative flex h-full flex-1 cursor-default flex-col justify-end"
            >
              {isActive && (
                <div className="pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--color-fg)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--color-bg-elevated)] shadow-soft">
                  {format(it.value)}
                </div>
              )}
              <div
                className="w-full rounded-t-[3px] transition-[height,background-color,opacity] duration-300"
                style={{
                  height: `${(it.value / max) * 100}%`,
                  minHeight: it.value > 0 ? 2 : 0,
                  background: isActive ? 'var(--color-accent)' : 'var(--color-navy-300)',
                  opacity: active == null || isActive ? 1 : 0.7,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-[3px]">
        {items.map((it, i) => (
          <div key={i} className="min-w-0 flex-1 text-center text-[9px] tabular-nums text-[var(--color-fg-subtle)]">
            {i % labelEvery === 0 ? it.label : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- LineChart: multi-série com crosshair interativo ----------
export interface LineSeries {
  name: string
  color: string
  values: number[]
  dashed?: boolean
  fill?: boolean
}

export function LineChart({
  labels,
  series,
  format = fmtMin,
  height = 300,
  labelEvery = 2,
}: {
  labels: string[]
  series: LineSeries[]
  format?: (n: number) => string
  height?: number
  labelEvery?: number
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const padL = 46
  const padR = 14
  const padT = 14
  const padB = 26
  const innerW = Math.max(w - padL - padR, 0)
  const innerH = height - padT - padB
  const n = labels.length

  const allVals = series.flatMap(s => s.values).filter(v => v != null && !isNaN(v))
  const rawMax = Math.max(...allVals, 1)
  const niceMax = Math.ceil(rawMax / 50) * 50 || 50

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => padT + innerH - (v / niceMax) * innerH
  const ticks = [0, niceMax / 2, niceMax]

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (n <= 1 || innerW <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left - padL
    const idx = Math.round((mx / innerW) * (n - 1))
    setActive(Math.max(0, Math.min(n - 1, idx)))
  }

  return (
    <div>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {w > 0 && (
          <svg
            width={w}
            height={height}
            onMouseMove={onMove}
            onMouseLeave={() => setActive(null)}
            className="overflow-visible"
          >
            {/* gridlines + labels do eixo Y */}
            {ticks.map((t, i) => (
              <g key={i}>
                <line
                  x1={padL}
                  x2={padL + innerW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--color-border)"
                  strokeWidth={1}
                  strokeDasharray={i === 0 ? '' : '3 4'}
                />
                <text x={padL - 8} y={y(t) + 3} textAnchor="end" className="fill-[var(--color-fg-subtle)] text-[10px] tabular-nums">
                  {Math.round(t)}
                </text>
              </g>
            ))}

            {/* áreas + linhas */}
            {series.map(s => {
              const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
              const area = `${padL},${padT + innerH} ${pts} ${padL + innerW},${padT + innerH}`
              return (
                <g key={s.name}>
                  {s.fill && <polygon points={area} fill={s.color} opacity={0.08} />}
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2.25}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={s.dashed ? '5 4' : ''}
                  />
                </g>
              )
            })}

            {/* crosshair + pontos no índice ativo */}
            {active != null && (
              <g>
                <line
                  x1={x(active)}
                  x2={x(active)}
                  y1={padT}
                  y2={padT + innerH}
                  stroke="var(--color-fg-subtle)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                {series.map(s => (
                  <circle key={s.name} cx={x(active)} cy={y(s.values[active])} r={3.5} fill="var(--color-bg-elevated)" stroke={s.color} strokeWidth={2} />
                ))}
              </g>
            )}

            {/* labels do eixo X */}
            {labels.map((lb, i) =>
              i % labelEvery === 0 ? (
                <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="fill-[var(--color-fg-subtle)] text-[10px] tabular-nums">
                  {lb}
                </text>
              ) : null,
            )}
          </svg>
        )}

        {/* tooltip flutuante */}
        {active != null && w > 0 && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[140px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2.5 text-[11px] shadow-diffusion"
            style={{
              left: Math.min(Math.max(x(active) - 70, 4), Math.max(w - 148, 4)),
            }}
          >
            <div className="mb-1 font-semibold text-[var(--color-fg)]">{labels[active]}</div>
            <ul className="space-y-1">
              {series.map(s => (
                <li key={s.name} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[var(--color-fg-muted)]">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--color-fg)]">{format(s.values[active])}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* legenda */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {series.map(s => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-fg-muted)]">
            <span
              className="inline-block h-[3px] w-4 rounded-full"
              style={{ background: s.color, opacity: s.dashed ? 0.6 : 1 }}
            />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}
