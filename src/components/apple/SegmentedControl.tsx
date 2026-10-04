'use client'

import * as React from 'react'
import { motion } from 'motion/react'
import { SPRING_UI } from '@/lib/motion'

export type SegmentedOpcao = { value: string; label: React.ReactNode; disabled?: boolean }

/** Controle segmentado estilo Apple (mesmo do Norte Vendas/Estoque): trilho
 *  cinza com a opção ativa numa pílula branca que desliza. */
export function SegmentedControl({
  opcoes,
  value,
  onChange,
  className = '',
  tamanho = 'md',
  'aria-label': ariaLabel,
}: {
  opcoes: SegmentedOpcao[]
  value: string
  onChange: (v: string) => void
  className?: string
  tamanho?: 'md' | 'lg'
  'aria-label'?: string
}) {
  const id = React.useId()
  const alto = tamanho === 'lg' ? 'h-9 px-4 text-[14px]' : 'h-8 px-3 text-[13px]'
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex max-w-full shrink-0 items-center overflow-x-auto rounded-[11px] bg-[var(--color-bg-hover)] p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {opcoes.map(o => {
        const ativo = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={ativo}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`relative shrink-0 whitespace-nowrap rounded-[8px] font-semibold u-motion disabled:cursor-not-allowed disabled:opacity-40 ${alto} ${
              ativo ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
            }`}
          >
            {ativo && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[8px] bg-[var(--color-bg-elevated)] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_1px_rgba(0,0,0,0.04)]"
                transition={SPRING_UI}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
