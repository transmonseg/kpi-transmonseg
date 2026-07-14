'use client'

import { useState } from 'react'
import { ArrowRight, CalendarBlank, WarningCircle, FileArrowDown } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/components/ui'
import { FileDropzone } from '@/app/painel/file-dropzone'

type AvisoCobertura =
  | { tipo: 'carga_ausente'; carga: string; destino: string; placa: string }
  | { tipo: 'placa_divergente'; carga: string; placaEscala: string; placaRomaneio: string }
  | { tipo: 'entregas_incompletas'; carga: string; planejado: number; recebido: number }

function descreveAviso(a: AvisoCobertura): string {
  switch (a.tipo) {
    case 'carga_ausente':
      return `Carga ${a.carga} (${a.destino}, placa ${a.placa}) está na escala mas não apareceu no romaneio.`
    case 'placa_divergente':
      return `Carga ${a.carga}: placa da escala (${a.placaEscala}) diverge da placa no romaneio (${a.placaRomaneio}).`
    case 'entregas_incompletas':
      return `Carga ${a.carga}: escala planejava ${a.planejado} NFs, romaneio trouxe só ${a.recebido}.`
  }
}

export default function NutrimaxGerarPage() {
  const [escala, setEscala] = useState<File[]>([])
  const [romaneio, setRomaneio] = useState<File[]>([])
  const [data, setData] = useState('')
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<AvisoCobertura[]>([])
  const [resultado, setResultado] = useState<{ xlsxBase64: string; filename: string } | null>(null)

  const pronto = escala.length > 0 && romaneio.length > 0 && !!data

  async function gerar() {
    if (!pronto) return
    setPending(true)
    setErro(null)
    setAvisos([])
    setResultado(null)
    try {
      const fd = new FormData()
      fd.set('escala', escala[0])
      fd.set('romaneio', romaneio[0])
      fd.set('data', data)
      const res = await fetch('/api/kpi/nutrimax/gerar', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json() as { avisos: AvisoCobertura[]; xlsxBase64: string; filename: string }
      setAvisos(json.avisos ?? [])
      setResultado({ xlsxBase64: json.xlsxBase64, filename: json.filename })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setPending(false)
    }
  }

  function baixar() {
    if (!resultado) return
    const bin = atob(resultado.xlsxBase64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = resultado.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          KPI Nutrimax
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Gerar KPI
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba a Escala de Rota (o planejado: qual placa vai pra qual destino) e o Romaneio de
          Entrega (o executado). O sistema cruza os dois com o status do Unitrac e avisa se
          alguma carga da escala não apareceu no romaneio antes de gerar o XLSX.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="col-span-1 lg:col-span-7">
          <FileDropzone
            eyebrow="Passo 1"
            label="Escala de Rota"
            hint="PDF · o planejado (placa, destino, NFs previstos)"
            accept=".pdf"
            files={escala}
            onAdd={files => setEscala(files.slice(0, 1))}
            onRemove={() => setEscala([])}
          />
        </div>

        <div className="col-span-1 flex flex-col gap-4 lg:col-span-5">
          <FileDropzone
            eyebrow="Passo 2"
            label="Romaneio de Entrega"
            hint="PDF · o executado (cliente a cliente por carga)"
            accept=".pdf"
            files={romaneio}
            onAdd={files => setRomaneio(files.slice(0, 1))}
            onRemove={() => setRomaneio([])}
          />

          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
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
          </div>
        </div>
      </section>

      {erro && (
        <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <p className="text-[13px] leading-relaxed text-[var(--color-danger-soft-fg)]">{erro}</p>
        </div>
      )}

      {avisos.length > 0 && (
        <div className="mt-6 flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-5 py-4">
          <div className="flex items-center gap-2">
            <WarningCircle size={18} weight="fill" className="shrink-0 text-[var(--color-warning)]" />
            <span className="text-[13px] font-semibold text-[var(--color-warning-soft-fg)]">
              {avisos.length} aviso{avisos.length > 1 ? 's' : ''} de cobertura
            </span>
          </div>
          <ul className="ml-7 flex flex-col gap-1 text-[12.5px] leading-relaxed text-[var(--color-warning-soft-fg)]">
            {avisos.map((a, i) => (
              <li key={i}>{descreveAviso(a)}</li>
            ))}
          </ul>
        </div>
      )}

      {resultado && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-5 py-4">
          <span className="text-[13px] text-[var(--color-success-soft-fg)]">
            KPI gerado{avisos.length > 0 ? ' com avisos acima' : ''}. Baixe o XLSX e suba em &quot;Inserir KPI&quot;.
          </span>
          <button
            type="button"
            onClick={baixar}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-navy-700)] px-4 py-2 text-[12.5px] font-medium text-white"
          >
            <FileArrowDown size={14} weight="bold" />
            Baixar XLSX
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
            {pending ? 'Cruzando escala com romaneio…' : pronto ? 'Gerar agora' : 'Aguardando arquivos'}
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
