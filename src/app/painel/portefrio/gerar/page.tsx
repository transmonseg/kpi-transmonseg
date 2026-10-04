'use client'

import { useState } from 'react'
import { ArrowRight, CalendarBlank, WarningCircle, FileArrowDown, CheckCircle } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/components/ui'
import { FileDropzone } from '@/app/painel/file-dropzone'

function hoje(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export default function PortefrioGerarPage() {
  const [romaneio, setRomaneio] = useState<File[]>([])
  const [data, setData] = useState(hoje())
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [arquivoPronto, setArquivoPronto] = useState<{ blob: Blob; filename: string } | null>(null)
  const [baixado, setBaixado] = useState(false)

  const pronto = romaneio.length > 0 && !!data

  async function gerar() {
    if (!pronto) return
    setPending(true)
    setErro(null)
    setArquivoPronto(null)
    setBaixado(false)
    try {
      const fd = new FormData()
      fd.set('romaneio', romaneio[0])
      fd.set('data', data)
      const res = await fetch('/api/kpi/portefrio/gerar', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())

      const blob = await res.blob()
      setArquivoPronto({ blob, filename: `KPI-Portefrio-${data}.xlsx` })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setPending(false)
    }
  }

  // Pedido do usuario 06/09: nao baixa sozinho ao terminar -- so' fica pronto
  // e o operador clica "Baixar" quando quiser (evita o navegador empilhar
  // downloads de geracoes que ele so' queria conferir na tela).
  function baixar() {
    if (!arquivoPronto) return
    const url = URL.createObjectURL(arquivoPronto.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = arquivoPronto.filename
    a.click()
    URL.revokeObjectURL(url)
    setBaixado(true)
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-overline">
          KPI Portefrio
        </span>
        <h1 className="text-display text-[34px] leading-none text-[var(--color-fg)] md:text-[40px]">
          Gerar KPI
        </h1>
        <p className="mt-2 max-w-[65ch] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba o romaneio do dia. O sistema geocodifica os endereços, cruza com o GPS e a
          temperatura do baú refrigerado da Ravex, e monta o KPI por cliente — ordem
          planejada x real, horário de chegada e temperatura durante a parada.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="col-span-1 lg:col-span-6">
          <FileDropzone
            eyebrow="Passo 1"
            label="Romaneio"
            hint="PDF · placas, clientes, endereços e ordem de atendimento"
            accept=".pdf"
            files={romaneio}
            onAdd={files => setRomaneio(files.slice(0, 1))}
            onRemove={() => setRomaneio([])}
          />
        </div>

        <div className="col-span-1 lg:col-span-6">
          <div className="dash-card flex h-full min-h-[176px] flex-col gap-2 p-5">
            <div className="flex items-center gap-2 text-overline">
              <CalendarBlank size={12} weight="bold" />
              Passo 2 · Data de referência
            </div>
            <input
              id="data"
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="mt-1 w-full bg-transparent text-[24px] font-semibold tracking-[-0.02em] tabular-nums text-[var(--color-fg)] outline-none [color-scheme:light] dark:[color-scheme:dark]"
             
            />
          </div>
        </div>
      </section>

      {erro && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <p className="text-[13px] leading-relaxed text-[var(--color-danger-soft-fg)]">{erro}</p>
        </div>
      )}

      {arquivoPronto && !erro && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-5 py-4">
          <p className="flex items-center gap-2 text-[13px] leading-relaxed text-[var(--color-success-soft-fg)]">
            <CheckCircle size={18} weight="fill" className="shrink-0 text-[var(--color-success)]" />
            {arquivoPronto.filename} pronto{baixado ? ' (baixado)' : ''}.
          </p>
          <button
            type="button"
            onClick={baixar}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-success)] px-3.5 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <FileArrowDown size={14} weight="bold" />
            {baixado ? 'Baixar de novo' : 'Baixar'}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={gerar}
        disabled={pending || !pronto}
        className={cn(
          'group relative mt-8 flex w-full items-center justify-between gap-4 overflow-hidden rounded-[22px] px-7 py-6 text-left transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99]',
          pronto && !pending
            ? 'dash-hero hover:-translate-y-0.5'
            : pending
              ? 'dash-hero'
              : 'dash-card cursor-not-allowed text-[var(--color-fg-muted)]'
        )}
      >
        <div className="flex flex-col gap-1">
          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.14em]', pronto || pending ? 'text-white/65' : 'text-[var(--color-fg-subtle)]')}>
            {pending ? 'Processando' : 'Gerar KPI'}
          </span>
          <span className="text-[20px] font-semibold tracking-[-0.015em]">
            {pending ? 'Geocodificando e cruzando com a Ravex…' : pronto ? 'Gerar agora' : 'Aguardando arquivo'}
          </span>
        </div>
        {!pending && pronto && (
          <ArrowRight size={22} weight="bold" className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
        )}
      </button>
    </div>
  )
}
