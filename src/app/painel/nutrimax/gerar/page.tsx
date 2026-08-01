'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarBlank, WarningCircle, FileArrowDown, Truck, WifiHigh, ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { Badge, cn } from '@/components/ui'
import { FileDropzone } from '@/app/painel/file-dropzone'
import { foraDoAlcanceApi } from '@/lib/kpi-nutrimax/constants'

type Resumo = { total: number; ok: number; incompletos: number; semRastreador: number }
type Tone = 'default' | 'success' | 'warning' | 'danger'
type StatusLinha = 'ok' | 'incompleto' | 'sem_rastreador'
type Linha = {
  carga: string
  placa: string
  destino: string
  motorista: string
  pesoKg: number | null
  entPlanejado: number | null
  qtdParadasReal: number
  kmPercorrido: number | null
  inicioViagem: string | null
  fimViagem: string | null
  status: StatusLinha
}
type Filtro = 'todas' | 'problemas' | 'ok'

function fmtHora(iso: string | null): string {
  if (!iso) return '—'
  return iso.slice(11, 16)
}

export default function NutrimaxGerarPage() {
  const [escala, setEscala] = useState<File[]>([])
  const [relatorio, setRelatorio] = useState<File[]>([])
  const [modoApi, setModoApi] = useState(false)
  const [data, setData] = useState('')
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [filtro, setFiltro] = useState<Filtro>('problemas')
  const [resultado, setResultado] = useState<{ xlsxBase64: string; filename: string } | null>(null)
  const [reabrindoId, setReabrindoId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const id = params.get('geracao')
    if (!id) return
    setReabrindoId(id)
    ;(async () => {
      try {
        const res = await fetch('/api/kpi/nutrimax/historico/reabrir', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id }),
        })
        if (!res.ok) throw new Error(await res.text())
        const json = await res.json() as { resumo: Resumo; linhas: Linha[]; xlsxBase64: string; filename: string }
        setResumo(json.resumo)
        setLinhas(json.linhas)
        setFiltro(json.resumo.incompletos + json.resumo.semRastreador > 0 ? 'problemas' : 'todas')
        setResultado({ xlsxBase64: json.xlsxBase64, filename: json.filename })
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível reabrir essa geração.')
      } finally {
        setReabrindoId(null)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dataForaDoAlcance = modoApi && !!data && foraDoAlcanceApi(data)
  const pronto = escala.length > 0 && (modoApi || relatorio.length > 0) && !!data && !dataForaDoAlcance

  async function gerar() {
    if (!pronto) return
    setPending(true)
    setErro(null)
    setResumo(null)
    setLinhas([])
    setResultado(null)
    try {
      const fd = new FormData()
      fd.set('escala', escala[0])
      if (!modoApi) fd.set('relatorio', relatorio[0])
      fd.set('data', data)
      if (modoApi) fd.set('modoApi', 'true')
      const res = await fetch('/api/kpi/nutrimax/gerar', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json() as { resumo: Resumo; linhas: Linha[]; xlsxBase64: string; filename: string }
      setResumo(json.resumo)
      setLinhas(json.linhas)
      setFiltro(json.resumo.incompletos + json.resumo.semRastreador > 0 ? 'problemas' : 'todas')
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
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
            KPI Nutry Max
          </span>
          <Link
            href="/painel/nutrimax/historico"
            className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            <ClockCounterClockwise size={13} weight="bold" />
            Histórico
          </Link>
        </div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Gerar KPI
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba a Escala de Rota e o Relatório Parada e Serviço do Unitrac. O sistema cruza o
          planejado com o realizado de verdade (paradas e km reais, por GPS, completado com a
          API ao vivo) e gera o KPI por carga/placa.
        </p>
      </header>

      {reabrindoId && (
        <div className="mb-6 flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-info)]/30 bg-[var(--color-info-soft)] px-5 py-4">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--color-info)] border-t-transparent" />
          <p className="text-[13px] text-[var(--color-info-soft-fg)]">Reabrindo geração #{reabrindoId.slice(0, 8)}…</p>
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={modoApi}
          onClick={() => setModoApi(v => !v)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200',
            modoApi ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border-strong)]',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
              modoApi ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-[var(--color-fg)]">Modo API</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-[var(--color-info-soft)] text-[var(--color-info-soft-fg)]">Beta</span>
          <span className="text-[12px] text-[var(--color-fg-muted)]">
            {modoApi ? 'Paradas puxadas direto da API Unitrac — sem PDF necessário' : 'Ativar para gerar KPI só com a escala (sem PDF do Unitrac)'}
          </span>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="col-span-1 lg:col-span-7">
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

        <div className="col-span-1 flex flex-col gap-4 lg:col-span-5">
          {modoApi ? (
            <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-5">
              <div className="flex items-center gap-2">
                <WifiHigh size={16} weight="bold" className="text-[var(--color-success)]" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-success)]">API Unitrac · Passo 2 automático</span>
              </div>
              <p className="text-[13px] text-[var(--color-fg-muted)]">
                As paradas serão puxadas direto da API Unitrac em tempo real. Nenhum arquivo necessário.
              </p>
            </div>
          ) : (
            <FileDropzone
              eyebrow="Passo 2"
              label="Relatório Parada e Serviço"
              hint="PDF do Unitrac · paradas e km reais por placa"
              accept=".pdf"
              files={relatorio}
              onAdd={files => setRelatorio(files.slice(0, 1))}
              onRemove={() => setRelatorio([])}
            />
          )}

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
            {dataForaDoAlcance && (
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-danger)]">
                Modo API só alcança as últimas 48h (hoje/ontem). Pra essa data, desligue o Modo API e envie o Relatório Parada e Serviço em PDF.
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

      {resumo && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CardResumo label="Total de cargas" valor={resumo.total} tone="default" />
          <CardResumo label="OK" valor={resumo.ok} tone="success" />
          <CardResumo label="Incompletos" valor={resumo.incompletos} tone="warning" />
          <CardResumo label="Sem rastreador" valor={resumo.semRastreador} tone="danger" />
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
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Paradas</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Km</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Início</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Fim</th>
                  <th className="w-36 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Status</th>
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
                      {l.qtdParadasReal}{l.entPlanejado != null ? `/${l.entPlanejado}` : ''}
                    </td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.kmPercorrido != null ? l.kmPercorrido.toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {fmtHora(l.inicioViagem)}
                    </td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {fmtHora(l.fimViagem)}
                    </td>
                    <td className="px-4 py-1.5 text-center">
                      <StatusBadge status={l.status} />
                    </td>
                  </tr>
                ))}
                {linhasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-[var(--color-fg-subtle)]">
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
            {pending ? (modoApi ? 'Puxando paradas da API…' : 'Cruzando escala com o relatório…') : pronto ? 'Gerar agora' : 'Aguardando arquivos'}
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

function CardResumo({ label, valor, tone }: { label: string; valor: number; tone: Tone }) {
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
    { id: 'problemas', label: 'Com problema', count: resumo.incompletos + resumo.semRastreador },
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
    incompleto: { label: 'INCOMPLETO', variant: 'warning' },
    sem_rastreador: { label: 'SEM RASTREADOR', variant: 'danger' },
  }
  const c = cfg[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
}
