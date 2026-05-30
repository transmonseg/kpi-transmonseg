import { View, Text, Svg, Rect, Line, Polyline } from '@react-pdf/renderer'
import { C } from './tema'

// ───────────────────────────────────────────────────────────────────────────
// Gráficos estáticos pra impressão (react-pdf Svg). Sem medição de DOM:
// todas as dimensões vêm por prop. Espelham a matemática de escala dos charts
// do dashboard (src/app/painel/charts.tsx), trocando HTML por primitivas Svg.
// Convenção: o <Svg> desenha só as formas; rótulos/eixos saem em <View>/<Text>
// (layout normal) — mais robusto no react-pdf v4.
// ───────────────────────────────────────────────────────────────────────────

const AXIS = C.border
const LABEL = C.muted

interface Pt {
  label: string
  value: number
}

/** Trunca rótulos longos pra caber na barra/eixo. */
function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// ── ColumnPdf: colunas verticais (volume/dia, distribuição horária) ──────────
export function ColumnPdf({
  data,
  width,
  height = 120,
  color = C.navy,
  labelEvery,
}: {
  data: Pt[]
  width: number
  height?: number
  color?: string
  labelEvery?: number
}) {
  const n = Math.max(data.length, 1)
  const max = Math.max(...data.map(d => d.value), 1)
  const gap = n > 30 ? 1 : 2
  const slot = width / n
  const barW = Math.max(slot - gap, 1)
  // a cada quantos rótulos mostrar (eixo X não vira sopa de letrinhas)
  const every = labelEvery ?? Math.max(1, Math.ceil(n / 12))

  return (
    <View>
      <Svg width={width} height={height}>
        {/* eixo base */}
        <Line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke={AXIS} strokeWidth={1} />
        {data.map((d, i) => {
          const h = max > 0 ? (d.value / max) * (height - 2) : 0
          const bh = d.value > 0 ? Math.max(h, 1) : 0
          return (
            <Rect
              key={i}
              x={i * slot + gap / 2}
              y={height - bh}
              width={barW}
              height={bh}
              fill={color}
            />
          )
        })}
      </Svg>
      {/* rótulos do eixo X (esparsos) */}
      <View style={{ flexDirection: 'row', marginTop: 2 }}>
        {data.map((d, i) => (
          <Text
            key={i}
            style={{ width: slot, fontSize: 6.5, color: LABEL, textAlign: 'center' }}
          >
            {i % every === 0 ? d.label : ''}
          </Text>
        ))}
      </View>
    </View>
  )
}

// ── BarPdf: barras horizontais (rankings) com rótulo + valor ─────────────────
export function BarPdf({
  data,
  width,
  height,
  color = C.navy,
  format,
}: {
  data: Pt[]
  width: number
  height?: number
  color?: string
  format?: (v: number) => string
}) {
  const fmt = format ?? ((v: number) => String(v))
  const rows = data
  const rowH = 16
  const gap = 5
  const labelW = Math.min(Math.max(width * 0.42, 90), 150)
  const valueW = 52
  const trackW = Math.max(width - labelW - valueW - 8, 20)
  const max = Math.max(...rows.map(d => d.value), 1)

  return (
    <View style={{ height }}>
      {rows.map((d, i) => {
        const w = max > 0 ? Math.max((d.value / max) * trackW, d.value > 0 ? 1.5 : 0) : 0
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: gap }}>
            <Text style={{ width: labelW, fontSize: 7.5, color: C.ink }}>
              {trunc(d.label, 28)}
            </Text>
            <View style={{ width: trackW }}>
              <Svg width={trackW} height={rowH - 6}>
                <Rect x={0} y={0} width={trackW} height={rowH - 6} fill={C.bgSubtle} />
                <Rect x={0} y={0} width={w} height={rowH - 6} fill={color} />
              </Svg>
            </View>
            <Text
              style={{ width: valueW, fontSize: 7.5, color: C.ink, textAlign: 'right' }}
            >
              {fmt(d.value)}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

// ── LinePdf: linha multi-série (evolução de tempos) ──────────────────────────
export function LinePdf({
  labels,
  series,
  width,
  height = 140,
  format,
}: {
  labels: string[]
  series: { name: string; color: string; values: (number | null)[] }[]
  width: number
  height?: number
  format?: (v: number) => string
}) {
  const fmt = format ?? ((v: number) => String(Math.round(v)))
  const padL = 34
  const padR = 8
  const padT = 8
  const padB = 4
  const innerW = Math.max(width - padL - padR, 0)
  const innerH = Math.max(height - padT - padB, 0)
  const n = labels.length

  const allVals = series
    .flatMap(s => s.values)
    .filter((v): v is number => v != null && !isNaN(v))
  const rawMax = Math.max(...allVals, 1)
  const niceMax = Math.ceil(rawMax / 30) * 30 || 30

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => padT + innerH - (v / niceMax) * innerH
  const ticks = [0, niceMax / 2, niceMax]

  // a cada quantos rótulos mostrar no eixo X
  const every = Math.max(1, Math.ceil(n / 10))

  return (
    <View>
      <Svg width={width} height={height}>
        {/* gridlines horizontais */}
        {ticks.map((t, i) => (
          <Line
            key={i}
            x1={padL}
            y1={y(t)}
            x2={padL + innerW}
            y2={y(t)}
            stroke={AXIS}
            strokeWidth={i === 0 ? 1 : 0.5}
          />
        ))}
        {/* séries */}
        {series.map(s => {
          const pts = s.values
            .map((v, i) => (v == null || isNaN(v) ? null : `${x(i)},${y(v)}`))
            .filter((p): p is string => p != null)
            .join(' ')
          if (!pts) return null
          return (
            <Polyline key={s.name} points={pts} fill="none" stroke={s.color} strokeWidth={1.5} />
          )
        })}
      </Svg>
      {/* rótulos do eixo Y (sobrepostos à esquerda) */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: padL - 2, height }}>
        {ticks
          .slice()
          .reverse()
          .map((t, i) => (
            <Text
              key={i}
              style={{
                position: 'absolute',
                top: y(t) - 4,
                width: padL - 4,
                fontSize: 6.5,
                color: LABEL,
                textAlign: 'right',
              }}
            >
              {fmt(t)}
            </Text>
          ))}
      </View>
      {/* rótulos do eixo X */}
      <View style={{ flexDirection: 'row', marginTop: 1, marginLeft: padL, width: innerW }}>
        {labels.map((lb, i) => (
          <Text
            key={i}
            style={{ width: innerW / Math.max(n, 1), fontSize: 6, color: LABEL, textAlign: 'center' }}
          >
            {i % every === 0 ? lb : ''}
          </Text>
        ))}
      </View>
      {/* legenda */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
        {series.map(s => (
          <View
            key={s.name}
            style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 2 }}
          >
            <View style={{ width: 10, height: 3, backgroundColor: s.color, marginRight: 4 }} />
            <Text style={{ fontSize: 7, color: C.inkSoft }}>{s.name}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
