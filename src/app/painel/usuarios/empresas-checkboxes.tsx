'use client'

import { useState } from 'react'
import { EMPRESA_LABEL } from '@/lib/kpi/empresas'
import { Label } from '@/components/ui'

export function EmpresasCheckboxes({
  opcoes,
  children,
}: {
  opcoes: readonly string[]
  children?: React.ReactNode
}) {
  const [marcadas, setMarcadas] = useState<string[]>([])
  const toggle = (e: string) => setMarcadas(m => (m.includes(e) ? m.filter(x => x !== e) : [...m, e]))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Empresas que esse login pode ver</Label>
        <div className="flex flex-wrap gap-1.5">
          {opcoes.map(e => (
            <label
              key={e}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] transition-colors has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent-soft)] has-[:checked]:text-[var(--color-accent-soft-fg)]"
            >
              <input
                type="checkbox" name="empresas" value={e} className="sr-only"
                checked={marcadas.includes(e)} onChange={() => toggle(e)}
              />
              {EMPRESA_LABEL[e] ?? e}
            </label>
          ))}
        </div>
      </div>
      {marcadas.includes('benassi') && children}
    </div>
  )
}
