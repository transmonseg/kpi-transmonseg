'use client'

import { useState } from 'react'
import { REDE_LABEL } from '@/lib/kpi/redes'
import { Label } from '@/components/ui'

export function RedesCheckboxes({ opcoes }: { opcoes: readonly string[] }) {
  const [marcadas, setMarcadas] = useState<string[]>([])
  const toggle = (r: string) => setMarcadas(m => (m.includes(r) ? m.filter(x => x !== r) : [...m, r]))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Redes que esse login pode ver</Label>
        <div className="flex gap-3 text-[11px] font-medium">
          <button type="button" onClick={() => setMarcadas([...opcoes])} className="text-[var(--color-accent)] hover:underline">
            Marcar todas
          </button>
          <button type="button" onClick={() => setMarcadas([])} className="text-[var(--color-fg-muted)] hover:underline">
            Limpar
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map(r => (
          <label
            key={r}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] transition-colors has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent-soft)] has-[:checked]:text-[var(--color-accent-soft-fg)]"
          >
            <input
              type="checkbox" name="redes" value={r} className="sr-only"
              checked={marcadas.includes(r)} onChange={() => toggle(r)}
            />
            {REDE_LABEL[r] ?? r}
          </label>
        ))}
      </div>
    </div>
  )
}
