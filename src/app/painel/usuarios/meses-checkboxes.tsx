'use client'

import { useState } from 'react'
import { formatMes } from '@/lib/kpi/meses'
import { Label } from '@/components/ui'

export function MesesCheckboxes({ opcoes, defaultMarcados = [], name = 'meses' }: { opcoes: readonly string[]; defaultMarcados?: string[]; name?: string }) {
  const [marcados, setMarcados] = useState<string[]>(defaultMarcados)
  const toggle = (m: string) => setMarcados(ms => (ms.includes(m) ? ms.filter(x => x !== m) : [...ms, m]))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Meses que esse login pode ver no Dashboard</Label>
        <div className="flex gap-3 text-[11px] font-medium">
          <button type="button" onClick={() => setMarcados([...opcoes])} className="text-[var(--color-accent)] hover:underline">
            Marcar todos
          </button>
          <button type="button" onClick={() => setMarcados([])} className="text-[var(--color-fg-muted)] hover:underline">
            Limpar
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map(m => (
          <label
            key={m}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium capitalize text-[var(--color-fg-muted)] transition-colors has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent-soft)] has-[:checked]:text-[var(--color-accent-soft-fg)]"
          >
            <input
              type="checkbox" name={name} value={m} className="sr-only"
              checked={marcados.includes(m)} onChange={() => toggle(m)}
            />
            {formatMes(m)}
          </label>
        ))}
      </div>
    </div>
  )
}
