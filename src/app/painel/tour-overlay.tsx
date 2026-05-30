'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import type { Passo } from '@/lib/tour/capitulos'

interface Props {
  passo: Passo
  idxGlobal: number   // 0-based no tour inteiro
  total: number       // total de passos do tour
  ehUltimoCap: boolean
  ehFinal: boolean
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

interface Box { x: number; y: number; w: number; h: number }

const PAD = 10
const PW = 330
const PH = 200

export function TourOverlay({ passo, idxGlobal, total, ehUltimoCap, ehFinal, onNext, onPrev, onClose }: Props) {
  const [box, setBox] = useState<Box | null>(null)
  const [vp, setVp] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const r = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    r()
    window.addEventListener('resize', r)
    return () => window.removeEventListener('resize', r)
  }, [])

  // mede o alvo, rola pra view, re-mede enquanto o passo está ativo
  useEffect(() => {
    let alive = true
    const medir = () => {
      const el = document.querySelector(passo.element)
      if (!el) { if (alive) setBox(null); return }
      const b = el.getBoundingClientRect()
      if (alive) setBox({ x: b.left - PAD, y: b.top - PAD, w: b.width + PAD * 2, h: b.height + PAD * 2 })
    }
    document.querySelector(passo.element)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    medir()
    const t = setTimeout(medir, 380)
    const iv = setInterval(medir, 400)
    window.addEventListener('scroll', medir, true)
    window.addEventListener('resize', medir)
    return () => {
      alive = false
      clearTimeout(t); clearInterval(iv)
      window.removeEventListener('scroll', medir, true)
      window.removeEventListener('resize', medir)
    }
  }, [passo.element])

  if (typeof document === 'undefined' || vp.w === 0) return null

  // posição do popover (lado preferido, mas sempre dentro da viewport)
  let px = vp.w / 2 - PW / 2
  let py = vp.h / 2 - PH / 2
  if (box) {
    const espacoAbaixo = vp.h - (box.y + box.h)
    py = passo.side === 'top' || espacoAbaixo < PH + 24 ? box.y - PH - 16 : box.y + box.h + 16
    px = box.x + box.w / 2 - PW / 2
  }
  px = Math.max(14, Math.min(px, vp.w - PW - 14))
  py = Math.max(14, Math.min(py, vp.h - PH - 14))

  // cursor: aponta pro canto do alvo (ou centro da tela se sem alvo)
  const cx = box ? box.x + box.w - 12 : vp.w / 2
  const cy = box ? box.y + box.h - 12 : vp.h / 2

  return createPortal(
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'none' }}>
      {/* Spotlight: recorte iluminado que VOA entre os alvos (box-shadow gigante escurece o resto) */}
      {box ? (
        <motion.div
          className="absolute left-0 top-0 rounded-2xl"
          initial={false}
          animate={{ x: box.x, y: box.y, width: box.w, height: box.h }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          style={{ boxShadow: '0 0 0 9999px rgba(8,10,18,0.74)', outline: '2px solid var(--color-accent)', outlineOffset: 0 }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: 'rgba(8,10,18,0.74)' }} />
      )}

      {/* Cursor animado apontando pro alvo */}
      <motion.div
        className="absolute left-0 top-0 z-10"
        initial={false}
        animate={{ x: cx, y: cy }}
        transition={{ type: 'spring', stiffness: 170, damping: 17 }}
      >
        <motion.svg
          width="30" height="30" viewBox="0 0 24 24" fill="none"
          animate={{ scale: [1, 0.82, 1] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,.45))' }}
        >
          <path d="M5 2.5l15 7.2-6.4 1.9-2 6.4L5 2.5z" fill="#ffffff" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinejoin="round" />
        </motion.svg>
      </motion.div>

      {/* Confete na tela final */}
      {ehFinal && <Confete vw={vp.w} vh={vp.h} />}

      {/* Popover */}
      <AnimatePresence mode="wait">
        <motion.div
          key={idxGlobal}
          className="absolute z-20 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
          style={{ left: px, top: py, width: PW, pointerEvents: 'auto', boxShadow: 'var(--shadow-diffusion)' }}
          initial={{ opacity: 0, scale: 0.9, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
              Passo {idxGlobal + 1} de {total}
            </span>
            <button onClick={onClose} aria-label="Fechar tutorial" className="text-[13px] text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg)]">✕</button>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-fg)]">{passo.title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{passo.description}</p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              onClick={onPrev} disabled={idxGlobal === 0}
              className="text-[12px] font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              Voltar
            </button>
            <button
              onClick={onNext}
              className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-semibold text-[var(--color-accent-fg)] transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.96]"
            >
              {ehFinal ? 'Concluir' : ehUltimoCap ? 'Próxima tela →' : 'Próximo'}
            </button>
          </div>

          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
            <motion.div
              className="h-full rounded-full bg-[var(--color-accent)]"
              initial={false}
              animate={{ width: `${((idxGlobal + 1) / total) * 100}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  )
}

// Confete sutil — partículas determinísticas (sem Math.random, evita hidratação).
const CORES = ['#1F3864', '#2563eb', '#16a34a', '#d97706', '#9fb3ce']
function Confete({ vw, vh }: { vw: number; vh: number }) {
  const n = 28
  return (
    <div className="absolute inset-0 z-30 overflow-hidden" style={{ pointerEvents: 'none' }}>
      {Array.from({ length: n }).map((_, i) => {
        const startX = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * vw
        const drift = (((Math.cos(i * 7.123) * 1000) % 1) - 0.5) * 120
        const delay = (i % 7) * 0.12
        const dur = 2.4 + (i % 5) * 0.25
        const size = 6 + (i % 3) * 3
        return (
          <motion.div
            key={i}
            className="absolute top-0 rounded-[2px]"
            style={{ left: startX, width: size, height: size * 1.4, background: CORES[i % CORES.length] }}
            initial={{ y: -30, opacity: 0, rotate: 0 }}
            animate={{ y: vh + 40, x: drift, opacity: [0, 1, 1, 0.8], rotate: 360 }}
            transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeIn' }}
          />
        )
      })}
    </div>
  )
}
