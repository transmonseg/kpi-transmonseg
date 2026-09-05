'use client'

import { useState } from 'react'
import { ArrowRight, CalendarBlank, WarningCircle, FileArrowDown, CheckCircle } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/components/ui'
import { FileDropzone } from '@/app/painel/file-dropzone'
import { foraDoAlcanceApi } from '@/lib/kpi-romaneio/constants'

function hoje(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

// Clone da tela da Nutry Max com as duas planilhas da Rio Quality no lugar dos
// PDFs (ver docs/plans/2026-09-05-kpi-rio-quality.md).
export default function RioQualityGerarPage() {
  const [custos, setCustos] = useState<File[]>([])
  const [entregas, setEntregas] = useState<File[]>([])
  const [data, setData] = useState(hoje())
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [baixado, setBaixado] = useState<string | null>(null)

  const dataForaDoAlcance = !!data && foraDoAlcanceApi(data, hoje())
  const pronto = custos.length > 0 && entregas.length > 0 && !!data && !dataForaDoAlcance

  async function gerar() {
    if (!pronto) return
    setPending(true)
    setErro(null)
    setBaixado(null)
    try {
      const fd = new FormData()
      fd.set('custos', custos[0])
      fd.set('entregas', entregas[0])
      fd.set('data', data)
      const res = await fetch('/api/kpi/rioquality/gerar', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())

      const blob = await res.blob()
      const filename = `KPI-Rio-Quality-${data}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setBaixado(filename)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          KPI Rio Quality
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Gerar KPI
        </h1>
        <p className="mt-1 max-w-[65ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba o Relatório de Custos (placa e rota) e o Relatório de Entregas (placa e endereço) do dia.
          O sistema localiza cada rua pela coerência da rota do caminhão, cruza com o GPS do Unitrac e
          monta o KPI por rota — paradas confirmadas, km percorrido e tempo de operação. Endereço que
          não deu pra localizar com segurança sai marcado no detalhe, nunca inventado.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="col-span-1 lg:col-span-4">
          <FileDropzone
            eyebrow="Passo 1"
            label="Relatório de Custos"
            hint="XLSX · placa e rota (zona) de cada caminhão"
            accept=".xlsx,.xls"
            files={custos}
            onAdd={files => setCustos(files.slice(0, 1))}
            onRemove={() => setCustos([])}
          />
        </div>

        <div className="col-span-1 lg:col-span-4">
          <FileDropzone
            eyebrow="Passo 2"
            label="Relatório de Entregas"
            hint="XLSX · placa e endereço (rua) de cada entrega"
            accept=".xlsx,.xls"
            files={entregas}
            onAdd={files => setEntregas(files.slice(0, 1))}
            onRemove={() => setEntregas([])}
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

      {baixado && !erro && (
        <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-5 py-4">
          <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-success)]" />
          <p className="flex items-center gap-2 text-[13px] leading-relaxed text-[var(--color-success-soft-fg)]">
            <FileArrowDown size={14} weight="bold" />
            {baixado} baixado.
          </p>
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
            {pending ? 'Localizando as ruas e cruzando com o Unitrac… (até 2 min)' : pronto ? 'Gerar agora' : 'Aguardando planilhas'}
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
