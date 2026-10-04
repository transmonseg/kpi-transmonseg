'use client'

import { useState } from 'react'
import { Lock } from '@phosphor-icons/react/dist/ssr'
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
          {opcoes.filter(e => e !== 'benassi').map(e => (
            <label
              key={e}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--color-fg-muted)] transition-[background-color,color,border-color,transform] duration-200 active:scale-[0.97] hover:text-[var(--color-fg)] has-[:checked]:border-[var(--color-navy-700)] has-[:checked]:bg-[var(--color-navy-700)] has-[:checked]:text-white"
            >
              <input
                type="checkbox" name="empresas" value={e} className="sr-only"
                checked={marcadas.includes(e)} onChange={() => toggle(e)}
              />
              {EMPRESA_LABEL[e] ?? e}
            </label>
          ))}
          {opcoes.includes('benassi') && (
            <span title="Benassi — desativada" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-dashed border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-fg-subtle)] opacity-70">
              <Lock size={11} weight="fill" /> Benassi
            </span>
          )}
        </div>
      </div>
      {marcadas.includes('benassi') && children}
    </div>
  )
}
