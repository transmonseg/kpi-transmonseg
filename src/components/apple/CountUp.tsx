'use client'

import { useEffect, useRef, useState } from 'react'

function fmt(v: number, frac: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac })
}
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/** Número que conta até o valor (só na 1ª montagem e quando o valor muda),
 *  ~700ms ease-out. Reduced-motion mostra direto. SSR mostra o valor final. */
export function CountUp({ value, frac = 0, duration = 700, className = '' }: {
  value: number | null | undefined
  frac?: number
  duration?: number
  className?: string
}) {
  const alvo = value ?? 0
  const [mostrado, setMostrado] = useState(alvo)
  const anterior = useRef(0)

  useEffect(() => {
    const reduz = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const de = anterior.current
    anterior.current = alvo
    if (reduz || duration <= 0 || de === alvo) { setMostrado(alvo); return }
    let raf = 0
    let t0 = 0
    const tick = (agora: number) => {
      if (!t0) t0 = agora
      const p = Math.min((agora - t0) / duration, 1)
      setMostrado(de + (alvo - de) * easeOut(p))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [alvo, duration])

  if (value == null) return <span className={className}>—</span>
  return <span className={`num ${className}`} suppressHydrationWarning>{fmt(frac === 0 ? Math.round(mostrado) : mostrado, frac)}</span>
}
