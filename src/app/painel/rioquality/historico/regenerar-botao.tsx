'use client'

import { useState } from 'react'
import { ArrowsClockwise, CircleNotch } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/components/ui'

/** Igual ao da Nutry Max: baixa as planilhas originais guardadas no Storage e
 *  roda a pipeline de novo -- se beneficia de qualquer fix aplicado desde a
 *  geracao original (inclusive melhorias no motor de coerencia). */
export function RegenerarBotao({ geracaoId, dataReferencia }: { geracaoId: string; dataReferencia: string }) {
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function regenerar() {
    setPending(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.set('regenerarDeId', geracaoId)
      const res = await fetch('/api/kpi/rioquality/gerar', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `KPI-Rio-Quality-${dataReferencia}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao regenerar.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={regenerar}
        disabled={pending}
        title="Baixa as planilhas originais e gera o KPI de novo, com qualquer correção aplicada desde então"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-fg-muted)] transition-colors',
          pending ? 'cursor-wait opacity-70' : 'hover:border-[var(--color-navy-700)] hover:text-[var(--color-navy-700)]'
        )}
      >
        {pending ? <CircleNotch size={12} weight="bold" className="animate-spin" /> : <ArrowsClockwise size={12} weight="bold" />}
        {pending ? 'Regerando…' : 'Regerar'}
      </button>
      {erro && <span className="max-w-[220px] text-right text-[11px] leading-snug text-[var(--color-danger)]">{erro}</span>}
    </div>
  )
}
