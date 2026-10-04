'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

const EASE_APPLE = [0.32, 0.72, 0, 1] as const

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export type Ponto = { chave: string; rotulo: string; valor: number | null; dica?: string }

// Curva suave (Catmull-Rom -> Bézier), sem ultrapassar muito os pontos.
function caminhoSuave(pts: [number, number][]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const t = 0.18
    d += ` C${p1[0] + (p2[0] - p0[0]) * t},${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t},${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]},${p2[1]}`
  }
  return d
}

/** Linha de taxa (%) com área, linha de meta e ponto selecionado. */
export function LinhaTaxa({ pontos, meta = 95, selecionado, aoSelecionar, altura = 220 }: {
  pontos: Ponto[]
  meta?: number
  selecionado?: string
  aoSelecionar?: (chave: string) => void
  altura?: number
}) {
  const [ref, w] = useLargura<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pad = { t: 16, r: 12, b: 28, l: 36 }
  const vals = pontos.map(p => p.valor).filter((v): v is number => v != null)
  const min = Math.max(0, Math.floor(Math.min(meta, ...vals) - 3))
  const max = Math.min(100, Math.ceil(Math.max(meta, ...vals) + 1))
  const iw = Math.max(0, w - pad.l - pad.r)
  const ih = altura - pad.t - pad.b
  const x = (i: number) => pad.l + (pontos.length <= 1 ? iw / 2 : (i / (pontos.length - 1)) * iw)
  const y = (v: number) => pad.t + ih - ((v - min) / (max - min || 1)) * ih
  const pts = pontos.map((p, i) => (p.valor == null ? null : [x(i), y(p.valor)] as [number, number])).filter(Boolean) as [number, number][]
  const linha = caminhoSuave(pts)
  const area = pts.length ? `${linha} L${pts[pts.length - 1][0]},${pad.t + ih} L${pts[0][0]},${pad.t + ih} Z` : ''
  const ticks = [min, Math.round((min + max) / 2), max]
  const ativo = hover ?? (selecionado ? pontos.findIndex(p => p.chave === selecionado) : -1)
  const rotulosCada = Math.max(1, Math.ceil(pontos.length / Math.max(1, Math.floor(iw / 56))))

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: altura }}>
      {w > 0 && (
        <svg width={w} height={altura} className="overflow-visible" onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="taxa-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map(t => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-border)" />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="num fill-[var(--color-fg-subtle)] text-[11px]">{t}%</text>
            </g>
          ))}
          <line x1={pad.l} x2={w - pad.r} y1={y(meta)} y2={y(meta)} stroke="var(--color-success)" strokeDasharray="4 4" strokeOpacity={0.7} />
          <text x={pad.l + 6} y={y(meta) - 6} textAnchor="start" className="fill-[var(--color-success)] text-[11px] font-semibold">meta {meta}%</text>
          <motion.path d={area} fill="url(#taxa-area)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease: EASE_APPLE }} />
          <motion.path
            d={linha}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: EASE_APPLE }}
          />
          {pontos.map((p, i) => p.valor == null ? null : (
            <g key={p.chave}>
              <rect
                x={x(i) - iw / Math.max(1, pontos.length) / 2}
                y={pad.t}
                width={Math.max(8, iw / Math.max(1, pontos.length))}
                height={ih}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHover(i)}
                onClick={() => aoSelecionar?.(p.chave)}
              />
              <motion.circle
                cx={x(i)}
                cy={y(p.valor)}
                r={i === ativo ? 5 : 3}
                fill={p.valor >= meta ? 'var(--color-success)' : 'var(--color-warning)'}
                stroke="var(--color-bg-elevated)"
                strokeWidth={2}
                initial={false}
                animate={{ r: i === ativo ? 5.5 : 3 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                pointerEvents="none"
              />
            </g>
          ))}
          {pontos.map((p, i) => (i % rotulosCada === 0 || i === pontos.length - 1) && (
            <text key={`r-${p.chave}`} x={x(i)} y={altura - 8} textAnchor="middle" className="num fill-[var(--color-fg-subtle)] text-[11px]">{p.rotulo}</text>
          ))}
        </svg>
      )}
      {ativo >= 0 && pontos[ativo]?.valor != null && w > 0 && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[10px] bg-[var(--color-fg)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--color-bg)] shadow-lg"
          style={{ left: Math.min(Math.max(x(ativo), 60), w - 60), top: y(pontos[ativo].valor as number) - 10 }}
        >
          <span className="num font-semibold">{(pontos[ativo].valor as number).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
          <span className="ml-1.5 opacity-70">{pontos[ativo].dica ?? pontos[ativo].rotulo}</span>
        </div>
      )}
    </div>
  )
}

/** Colunas simples (KM por dia), com a coluna selecionada em destaque. */
export function Colunas({ pontos, selecionado, aoSelecionar, altura = 180, formatar }: {
  pontos: Ponto[]
  selecionado?: string
  aoSelecionar?: (chave: string) => void
  altura?: number
  formatar: (v: number) => string
}) {
  const [ref, w] = useLargura<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pad = { t: 20, b: 26 }
  const ih = altura - pad.t - pad.b
  const max = Math.max(1, ...pontos.map(p => p.valor ?? 0))
  const passo = pontos.length ? w / pontos.length : 0
  const larg = Math.max(4, Math.min(28, passo * 0.62))
  const rotulosCada = Math.max(1, Math.ceil(pontos.length / Math.max(1, Math.floor(w / 56))))
  const ativo = hover ?? (selecionado ? pontos.findIndex(p => p.chave === selecionado) : -1)
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: altura }} onMouseLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={altura}>
          {pontos.map((p, i) => {
            const v = p.valor ?? 0
            const h = (v / max) * ih
            const cx = passo * i + passo / 2
            const destaque = i === ativo
            return (
              <g key={p.chave} className="cursor-pointer" onMouseEnter={() => setHover(i)} onClick={() => aoSelecionar?.(p.chave)}>
                <rect x={passo * i} y={0} width={passo} height={altura} fill="transparent" />
                <motion.rect
                  x={cx - larg / 2}
                  width={larg}
                  rx={Math.min(6, larg / 2)}
                  initial={{ height: 0, y: pad.t + ih }}
                  animate={{ height: h, y: pad.t + ih - h }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.6, delay: i * 0.015 }}
                  fill="var(--color-accent)"
                  fillOpacity={destaque ? 1 : 0.38}
                />
                {(i % rotulosCada === 0 || i === pontos.length - 1) && (
                  <text x={cx} y={altura - 8} textAnchor="middle" className="num fill-[var(--color-fg-subtle)] text-[11px]">{p.rotulo}</text>
                )}
              </g>
            )
          })}
        </svg>
      )}
      {ativo >= 0 && pontos[ativo] && w > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-[10px] bg-[var(--color-fg)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--color-bg)] shadow-lg"
          style={{ left: Math.min(Math.max(passo * ativo + passo / 2, 60), w - 60) }}
        >
          <span className="num font-semibold">{formatar(pontos[ativo].valor ?? 0)}</span>
          <span className="ml-1.5 opacity-70">{pontos[ativo].dica ?? pontos[ativo].rotulo}</span>
        </div>
      )}
    </div>
  )
}
