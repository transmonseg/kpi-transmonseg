'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, CalendarBlank, WarningCircle, FileArrowDown, Truck } from '@phosphor-icons/react/dist/ssr'
import { Badge, cn } from '@/components/ui'
import { FileDropzone } from '@/app/painel/file-dropzone'

type Resumo = { total: number; ok: number; divergentes: number; ausentes: number; pesoTotalKg: number }
type Tone = 'default' | 'success' | 'warning' | 'danger'
type StatusLinha = 'ok' | 'divergente' | 'ausente'
type Linha = {
  carga: string
  placa: string
  destino: string
  motorista: string
  pesoKg: number | null
  nfPlanejado: number | null
  nfRecebido: number
  entPlanejado: number | null
  entRecebido: number
  status: StatusLinha
}
type Filtro = 'todas' | 'problemas' | 'ok'

function fmtKg(n: number): string {
  return `${n.toLocaleString('pt-BR')} kg`
}

export default function NutrimaxRomaneioPage() {
  const [escala, setEscala] = useState<File[]>([])
  const [romaneio, setRomaneio] = useState<File[]>([])
  const [data, setData] = useState('')
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [filtro, setFiltro] = useState<Filtro>('problemas')
  const [resultado, setResultado] = useState<{ xlsxBase64: string; filename: string } | null>(null)

  const pronto = escala.length > 0 && romaneio.length > 0 && !!data

  async function processar() {
    if (!pronto) return
    setPending(true)
    setErro(null)
    setResumo(null)
    setLinhas([])
    setResultado(null)
    try {
      const fd = new FormData()
      fd.set('escala', escala[0])
      fd.set('romaneio', romaneio[0])
      fd.set('data', data)
      const res = await fetch('/api/kpi/nutrimax/romaneio', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json() as { resumo: Resumo; linhas: Linha[]; xlsxBase64: string; filename: string }
      setResumo(json.resumo)
      setLinhas(json.linhas)
      setFiltro(json.resumo.divergentes + json.resumo.ausentes > 0 ? 'problemas' : 'todas')
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

  const linhasFiltradas = useMemo(() => {
    if (filtro === 'todas') return linhas
    if (filtro === 'ok') return linhas.filter(l => l.status === 'ok')
    return linhas.filter(l => l.status !== 'ok')
  }, [linhas, filtro])

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          Nutry Max
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Gerar Romaneio
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba a Escala de Rota e o Romaneio de Entrega. Confere cada placa da escala contra o
          romaneio e devolve um XLSX com uma aba de resumo e uma aba por placa.
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

      {resumo && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <CardResumo label="Total de cargas" valor={resumo.total} tone="default" />
          <CardResumo label="OK" valor={resumo.ok} tone="success" />
          <CardResumo label="Divergentes" valor={resumo.divergentes} tone="warning" />
          <CardResumo label="Ausentes" valor={resumo.ausentes} tone="danger" />
          <CardResumo label="Peso total" valor={fmtKg(resumo.pesoTotalKg)} tone="default" />
        </div>
      )}

      {resumo && (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3">
            <div className="flex items-center gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
                <Truck size={16} weight="fill" className="text-[var(--color-accent)]" />
                Cargas
              </h2>
              <FiltroChips filtro={filtro} setFiltro={setFiltro} resumo={resumo} />
            </div>
            {resultado && (
              <button
                type="button"
                onClick={baixar}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-navy-700)] px-4 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <FileArrowDown size={14} weight="bold" />
                Baixar XLSX
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-left">
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Carga</th>
                  <th className="w-32 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Placa</th>
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Destino</th>
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Motorista</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Peso</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Clientes</th>
                  <th className="w-20 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">NFs</th>
                  <th className="w-32 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {linhasFiltradas.map(l => (
                  <tr
                    key={`${l.carga}-${l.placa}`}
                    className={cn(
                      'border-b border-[var(--color-border)] last:border-0',
                      l.status !== 'ok' && 'bg-[var(--color-warning-soft)]/20',
                    )}
                  >
                    <td className="px-4 py-1.5 text-numeric font-medium text-[var(--color-fg)]">{l.carga}</td>
                    <td className="px-4 py-1.5 text-numeric text-[var(--color-fg)]">{l.placa}</td>
                    <td className="px-4 py-1.5 text-[var(--color-fg)]">{l.destino}</td>
                    <td className="px-4 py-1.5 text-[var(--color-fg-muted)]">{l.motorista}</td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.pesoKg != null ? l.pesoKg.toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.entRecebido}{l.entPlanejado != null ? `/${l.entPlanejado}` : ''}
                    </td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.nfRecebido}{l.nfPlanejado != null ? `/${l.nfPlanejado}` : ''}
                    </td>
                    <td className="px-4 py-1.5 text-center">
                      <StatusBadge status={l.status} />
                    </td>
                  </tr>
                ))}
                {linhasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[var(--color-fg-subtle)]">
                      Nenhuma carga nesse filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={processar}
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
            {pending ? 'Processando' : 'Conferir'}
          </span>
          <span className="text-[18px] font-semibold tracking-tight">
            {pending ? 'Cruzando escala com romaneio…' : pronto ? 'Gerar conferência' : 'Aguardando arquivos'}
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

function CardResumo({ label, valor, tone }: { label: string; valor: number | string; tone: Tone }) {
  const toneCls: Record<Tone, string> = {
    default: 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)]',
    success: 'border-transparent bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)]',
    warning: 'border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)]',
    danger: 'border-transparent bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]',
  }
  return (
    <div className={cn('rounded-xl border px-4 py-3 transition-colors', toneCls[tone])}>
      <div className="text-[22px] font-semibold leading-tight tracking-tight">{valor}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
    </div>
  )
}

function FiltroChips({ filtro, setFiltro, resumo }: { filtro: Filtro; setFiltro: (f: Filtro) => void; resumo: Resumo }) {
  const opts: { id: Filtro; label: string; count: number }[] = [
    { id: 'todas', label: 'Todas', count: resumo.total },
    { id: 'problemas', label: 'Com problema', count: resumo.divergentes + resumo.ausentes },
    { id: 'ok', label: 'OK', count: resumo.ok },
  ]
  return (
    <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-0.5">
      {opts.map(o => {
        const active = filtro === o.id
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setFiltro(o.id)}
            className={cn(
              'rounded-[4px] px-2 py-0.5 text-[11px] font-medium transition-colors',
              active
                ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm'
                : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}
          >
            {o.label} <span className="text-[var(--color-fg-subtle)]">({o.count})</span>
          </button>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: StatusLinha }) {
  const cfg: Record<StatusLinha, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
    ok: { label: 'OK', variant: 'success' },
    divergente: { label: 'DIVERGENTE', variant: 'warning' },
    ausente: { label: 'AUSENTE', variant: 'danger' },
  }
  const c = cfg[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
}
