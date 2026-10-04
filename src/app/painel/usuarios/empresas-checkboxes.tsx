'use client'

import { Lock } from '@phosphor-icons/react/dist/ssr'
import { EMPRESA_LABEL } from '@/lib/kpi/empresas'

/** Chips de empresa (marcar várias). `bloqueadas` aparecem com cadeado, sem
 *  poder marcar (Benassi desativada em 04/10/2026). */
export function EmpresasCheckboxes({ opcoes, bloqueadas = [] }: { opcoes: readonly string[]; bloqueadas?: string[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] font-semibold text-[var(--color-fg-muted)]">Empresa</legend>
      <div className="flex flex-wrap gap-2">
        {opcoes.map(e => (
          <label
            key={e}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--color-bg-subtle)] px-3.5 py-2 text-[14px] font-medium text-[var(--color-fg-muted)] u-motion u-press hover:text-[var(--color-fg)] has-[:checked]:bg-[var(--color-navy-700)] has-[:checked]:text-white"
          >
            <input type="checkbox" name="empresas" value={e} className="sr-only" />
            {EMPRESA_LABEL[e] ?? e}
          </label>
        ))}
        {bloqueadas.map(e => (
          <span key={e} title="Desativada" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full bg-[var(--color-bg-subtle)] px-3.5 py-2 text-[14px] font-medium text-[var(--color-fg-subtle)] opacity-60">
            <Lock size={12} weight="fill" /> {EMPRESA_LABEL[e] ?? e}
          </span>
        ))}
      </div>
    </fieldset>
  )
}
