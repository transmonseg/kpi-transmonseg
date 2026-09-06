'use client'

import { useState } from 'react'
import { ArrowRight, CalendarBlank, WarningCircle, FileArrowDown, CheckCircle } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/components/ui'
import { FileDropzone } from '@/app/painel/file-dropzone'
import { foraDoAlcanceApi } from '@/lib/kpi-romaneio/constants'

function hoje(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export default function NutrimaxGerarPage() {
  const [escala, setEscala] = useState<File[]>([])
  const [romaneio, setRomaneio] = useState<File[]>([])
  const [data, setData] = useState(hoje())
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [arquivoPronto, setArquivoPronto] = useState<{ blob: Blob; filename: string } | null>(null)
  const [baixado, setBaixado] = useState(false)

  const dataForaDoAlcance = !!data && foraDoAlcanceApi(data, hoje())
  const pronto = escala.length > 0 && romaneio.length > 0 && !!data && !dataForaDoAlcance

  async function gerar() {
    if (!pronto) return
    setPending(true)
    setErro(null)
    setArquivoPronto(null)
    setBaixado(false)
    try {
      const fd = new FormData()
      fd.set('escala', escala[0])
      fd.set('romaneio', romaneio[0])
      fd.set('data', data)
      const res = await fetch('/api/kpi/nutrimax/gerar', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())

      const blob = await res.blob()
      setArquivoPronto({ blob, filename: `KPI-Nutry-Max-${data}.xlsx` })
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
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          KPI Nutry Max
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Gerar KPI
        </h1>
        <p className="mt-1 max-w-[65ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba a Escala de Rota e o Romaneio de Entrega do dia. O sistema geocodifica os
          endereços, cruza com a confirmação de entrega e o GPS ao vivo do Unitrac, e monta
          o KPI por carga — paradas confirmadas, km percorrido, saída/chegada do CD e tempo
          de operação.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="col-span-1 lg:col-span-4">
          <FileDropzone
            eyebrow="Passo 1"
            label="Escala de Rota"
            hint="PDF · o planejado (placa, destino, clientes previstos)"
            accept=".pdf"
            files={escala}
            onAdd={files => setEscala(files.slice(0, 1))}
            onRemove={() => setEscala([])}
          />
        </div>

        <div className="col-span-1 lg:col-span-4">
          <FileDropzone
            eyebrow="Passo 2"
            label="Romaneio de Entrega"
            hint="PDF · cargas, NFs e endereços dos clientes"
            accept=".pdf"
            files={romaneio}
            onAdd={files => setRomaneio(files.slice(0, 1))}
            onRemove={() => setRomaneio([])}
          />
        </div>

        <div className="col-span-1 lg:col-span-4">
          <div className="flex h-full flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
              <CalendarBlank size={12} weight="bold" />
              Passo 3 · Data de referência
            </div>
            <input
              id="data"
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="mt-1 w-full bg-transparent text-[24px] font-medium tracking-tight text-[var(--color-fg)] outline-none [color-scheme:light] dark:[color-scheme:dark]"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            {dataForaDoAlcance && (
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-danger)]">
                A API do Unitrac só alcança as últimas 48h (hoje/ontem) — escolha uma dessas datas.
              </p>
            )}
          </div>
        </div>
      </section>

      {erro && (
        <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <p className="text-[13px] leading-relaxed text-[var(--color-danger-soft-fg)]">{erro}</p>
        </div>
      )}

      {arquivoPronto && !erro && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-5 py-4">
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
          'group relative mt-8 flex w-full items-center justify-between gap-4 overflow-hidden rounded-[var(--radius-card)] px-7 py-5 text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.99]',
          pronto && !pending
            ? 'bg-[var(--color-navy-700)] text-white shadow-soft hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-10px_rgba(31,56,100,0.55)]'
            : pending
              ? 'bg-[var(--color-navy-700)] text-white'
              : 'cursor-not-allowed bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[var(--color-fg-muted)]'
        )}
      >
        {pending && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-[3px] w-1/4 bg-white/80 animate-progress-sweep"
            style={{ filter: 'blur(0.3px)' }}
          />
        )}
        <div className="flex flex-col gap-1">
          <span className={cn('text-[11px] font-medium uppercase tracking-[0.18em]', pronto || pending ? 'text-white/60' : 'text-[var(--color-fg-muted)]')}>
            {pending ? 'Processando' : 'Gerar KPI'}
          </span>
          <span className="text-[18px] font-semibold tracking-tight">
            {pending ? 'Geocodificando e cruzando com o Unitrac…' : pronto ? 'Gerar agora' : 'Aguardando arquivos'}
          </span>
        </div>
        {!pending && pronto && (
          <ArrowRight size={22} weight="bold" className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
        )}
        {pending && (
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '180ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '360ms' }} />
          </span>
        )}
      </button>
    </div>
  )
}
