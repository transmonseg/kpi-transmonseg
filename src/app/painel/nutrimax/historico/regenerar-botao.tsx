'use client'

import { useState } from 'react'
import { ArrowsClockwise, CircleNotch, FileArrowDown } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/components/ui'

/** Pedido do usuario 01/09 ("quero um historico das geracoes... pra gente
 *  poder sempre regerar"): baixa os PDFs originais guardados no Storage e
 *  roda a mesma pipeline de novo -- se beneficia de qualquer fix aplicado
 *  desde a geracao original. So aparece pra geracoes que guardaram os
 *  PDFs (a partir desta mudanca -- geracao antiga nao tem o que baixar).
 *
 *  Pedido do usuario 06/09: nao baixa sozinho ao terminar -- vira um botao
 *  "Baixar" que fica esperando o clique (evita empilhar downloads de
 *  regeracoes que o operador so' queria conferir). */
export function RegenerarBotao({ geracaoId, dataReferencia }: { geracaoId: string; dataReferencia: string }) {
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [arquivoPronto, setArquivoPronto] = useState<Blob | null>(null)
  // F3-04 (ACH-10): dia ja' fechado -> a rota responde 428 e pede o motivo.
  const [pedeMotivo, setPedeMotivo] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')

  async function regenerar() {
    setPending(true)
    setErro(null)
    setArquivoPronto(null)
    try {
      const fd = new FormData()
      fd.set('regenerarDeId', geracaoId)
      if (pedeMotivo) fd.set('motivo', motivo)
      const res = await fetch('/api/kpi/nutrimax/gerar', { method: 'POST', body: fd })
      if (res.status === 428) { setPedeMotivo(await res.text()); return }
      if (!res.ok) throw new Error(await res.text())
      setPedeMotivo(null); setMotivo('')
      setArquivoPronto(await res.blob())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao regenerar.')
    } finally {
      setPending(false)
    }
  }

  function baixar() {
    if (!arquivoPronto) return
    const url = URL.createObjectURL(arquivoPronto)
    const a = document.createElement('a')
    a.href = url
    a.download = `KPI-Nutry-Max-${dataReferencia}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    setArquivoPronto(null)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {arquivoPronto ? (
        <button
          type="button"
          onClick={baixar}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-success)]/40 bg-[var(--color-success-soft)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-success-soft-fg)] transition-opacity hover:opacity-90"
        >
          <FileArrowDown size={12} weight="bold" />
          Baixar
        </button>
      ) : (
        <button
          type="button"
          onClick={regenerar}
          disabled={pending || (!!pedeMotivo && motivo.trim().length < 5)}
          title="Baixa os PDFs originais e gera o KPI de novo, com qualquer correção aplicada desde então"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-fg-muted)] transition-colors',
            pending ? 'cursor-wait opacity-70' : 'hover:border-[var(--color-navy-700)] hover:text-[var(--color-navy-700)]'
          )}
        >
          {pending ? <CircleNotch size={12} weight="bold" className="animate-spin" /> : <ArrowsClockwise size={12} weight="bold" />}
          {pending ? 'Regerando…' : pedeMotivo ? 'Regerar com o motivo' : 'Regerar'}
        </button>
      )}
      {pedeMotivo && !arquivoPronto && (
        <div className="flex max-w-[260px] flex-col items-end gap-1">
          <span className="whitespace-normal text-right text-[11px] leading-snug text-[var(--color-fg-muted)]">{pedeMotivo}</span>
          <input
            value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo"
            onKeyDown={e => { if (e.key === 'Enter' && motivo.trim().length >= 5 && !pending) regenerar() }}
            className="h-8 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[12px] outline-none focus:border-[var(--color-navy-700)]"
          />
        </div>
      )}
      {erro && <span className="max-w-[220px] text-right text-[11px] leading-snug text-[var(--color-danger)]">{erro}</span>}
    </div>
  )
}
