'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import {
  UploadSimple,
  FilePdf,
  FileXls,
  X,
  CaretDown,
  FileArrowDown,
  ChartBarHorizontal,
  WarningCircle,
  CheckCircle,
  ArrowRight,
  CalendarBlank,
  WifiSlash,
  WifiHigh,
  Robot,
} from '@phosphor-icons/react/dist/ssr'
import { Button, Card, CardContent, Input, cn } from '@/components/ui'

type VeiculoSlot = {
  motorista_nome: string | null
  motorista_codigo: number | null
  placa_raw: string | null
  placa_norm: string | null
}

type AlteracaoParsed = {
  tipo: 'SUBSTITUICAO' | 'INCLUSAO' | 'COMUNICADO' | 'INFORMATIVO' | 'SWAP'
  rede_id: string | null
  loja_nome_raw: string | null
  entra: VeiculoSlot | null
  sai: VeiculoSlot | null
  motivo: string | null
  texto_original: string
  confianca: 'alta' | 'media' | 'baixa'
}

type PreviewLinha = {
  ordem: number
  loja_nome: string
  placa: string | null
  motorista: string | null
  turno: string
  tem_gps: boolean
  saida_cd_fmt: string | null
  chegada_loja_fmt: string | null
  tempo_loja_min: number | null
}

type RedeResult = {
  rede_id: string
  rede_nome: string
  qtd_rotas: number
  qtd_sem_gps: number
  xlsxBase64: string
  pdfBase64: string
  preview: PreviewLinha[]
  analise_ia: string | null
  analise_ia_erro: string | null
}

function downloadBase64(base64: string, filename: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtSlot(slot: VeiculoSlot | null): string {
  if (!slot) return '—'
  const parts: string[] = []
  if (slot.motorista_nome) parts.push(slot.motorista_nome)
  if (slot.motorista_codigo !== null && slot.motorista_codigo !== undefined) parts.push(`#${slot.motorista_codigo}`)
  if (slot.placa_norm) parts.push(slot.placa_norm)
  return parts.join(' · ') || '—'
}

const TIPO_LABELS: Record<AlteracaoParsed['tipo'], string> = {
  SUBSTITUICAO: 'Substituição',
  INCLUSAO: 'Inclusão',
  COMUNICADO: 'Comunicado',
  INFORMATIVO: 'Informativo',
  SWAP: 'Swap',
}

const CONF_CLASS: Record<string, string> = {
  alta: 'text-[var(--color-success)]',
  media: 'text-[var(--color-warning)]',
  baixa: 'text-[var(--color-danger)]',
}

// ─── Seção de alterações ────────────────────────────────────────────────────

interface AlteracoesCardProps {
  confirmadas: AlteracaoParsed[]
  onConfirm: (a: AlteracaoParsed) => void
  onRemove: (idx: number) => void
}

function AlteracoesCard({ confirmadas, onConfirm, onRemove }: AlteracoesCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [modo, setModo] = useState<'texto' | 'pdf'>('texto')
  const [texto, setTexto] = useState('')
  const [previews, setPreviews] = useState<AlteracaoParsed[]>([])
  const [analisando, startAnalisar] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function resetPreviews() { setPreviews([]); setErr(null) }

  function analisarTexto() {
    if (!texto.trim()) return
    resetPreviews()
    startAnalisar(async () => {
      try {
        const res = await fetch('/api/kpi/simples/analisar-alt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto }),
        })
        if (!res.ok) throw new Error(await res.text())
        setPreviews(await res.json() as AlteracaoParsed[])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao analisar.')
      }
    })
  }

  function analisarPdf(file: File) {
    resetPreviews()
    startAnalisar(async () => {
      try {
        const fd = new FormData()
        fd.append('pdf', file)
        const res = await fetch('/api/kpi/simples/analisar-alt', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(await res.text())
        setPreviews(await res.json() as AlteracaoParsed[])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao analisar.')
      }
    })
  }

  function confirmar(a: AlteracaoParsed) {
    onConfirm(a)
    setPreviews(prev => prev.filter(p => p !== a))
  }

  const count = confirmadas.length

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 cursor-pointer text-left hover:bg-[var(--color-bg-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
            Alterações de Escala
          </span>
          {count > 0 && (
            <span className="text-xs bg-[var(--color-info-soft)] text-[var(--color-info-soft-fg)] px-2 py-0.5 rounded-full font-medium">
              {count} confirmada{count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <CaretDown size={16} weight="bold" className={cn('text-[var(--color-fg-muted)] transition-transform duration-200', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <CardContent className="space-y-4 pt-0 border-t border-[var(--color-border)]">
          {/* Lista de confirmadas */}
          {confirmadas.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--color-fg-subtle)] pt-1">Confirmadas</p>
              {confirmadas.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded bg-[var(--color-bg-subtle)] px-3 py-2 text-xs">
                  <span className="text-[var(--color-fg)]">
                    <span className="font-medium">{TIPO_LABELS[a.tipo]}</span>
                    {a.rede_id && <span className="text-[var(--color-fg-muted)]"> · {a.rede_id}</span>}
                    {a.loja_nome_raw && <span className="text-[var(--color-fg-subtle)]"> · {a.loja_nome_raw}</span>}
                    {a.entra && <span className="text-[var(--color-success)]"> → {fmtSlot(a.entra)}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="ml-2 shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
                  >
                    <X size={12} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Seletor de modo */}
          <div className="flex gap-1.5 pt-1">
            {(['texto', 'pdf'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setModo(m); resetPreviews() }}
                className={cn(
                  'text-xs px-3 py-1 rounded border transition-colors',
                  modo === m
                    ? 'border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] text-[var(--color-fg)]'
                    : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)]',
                )}
              >
                {m === 'texto' ? 'Mensagem de texto' : 'PDF'}
              </button>
            ))}
          </div>

          {/* Input texto */}
          {modo === 'texto' && (
            <div className="space-y-2">
              <textarea
                value={texto}
                onChange={e => { setTexto(e.target.value); resetPreviews() }}
                rows={5}
                placeholder={`🚨 ALTERAÇÃO 🚨\nZona Sul Tijuca\nEntra: Carlos 432 ABC1D23\nSai: José 811 XYZ9876\nMotivo: falta`}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-xs font-mono text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:border-[var(--color-border-strong)] resize-y"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={analisarTexto}
                disabled={!texto.trim() || analisando}
              >
                {analisando ? 'Analisando…' : 'Analisar'}
              </Button>
            </div>
          )}

          {/* Input PDF */}
          {modo === 'pdf' && (
            <div className="space-y-2">
              <Input
                type="file"
                accept=".pdf"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) analisarPdf(f)
                }}
              />
              {analisando && <p className="text-xs text-[var(--color-fg-muted)]">Lendo PDF…</p>}
            </div>
          )}

          {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}

          {/* Previews para confirmar/descartar */}
          {previews.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--color-fg-muted)]">
                {previews.length} alteração{previews.length !== 1 ? 'ões' : ''} identificada{previews.length !== 1 ? 's' : ''} — confirme antes de gerar
              </p>
              {previews.map((a, i) => (
                <div key={i} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                  <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
                    <span className="text-xs font-semibold text-[var(--color-fg)]">{TIPO_LABELS[a.tipo]}</span>
                    <span className={cn('text-xs', CONF_CLASS[a.confianca] ?? 'text-[var(--color-fg-muted)]')}>
                      confiança {a.confianca}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 px-3 py-2.5 text-xs">
                    <div><span className="text-[var(--color-fg-subtle)]">Rede </span><span className="text-[var(--color-fg)]">{a.rede_id ?? '—'}</span></div>
                    <div><span className="text-[var(--color-fg-subtle)]">Loja </span><span className="text-[var(--color-fg)]">{a.loja_nome_raw ?? '—'}</span></div>
                    <div><span className="text-[var(--color-fg-subtle)]">Entra </span><span className="text-[var(--color-success)]">{fmtSlot(a.entra)}</span></div>
                    <div><span className="text-[var(--color-fg-subtle)]">Sai </span><span className="text-[var(--color-danger)]">{fmtSlot(a.sai)}</span></div>
                    {a.motivo && (
                      <div className="col-span-2">
                        <span className="text-[var(--color-fg-subtle)]">Motivo </span>
                        <span className="text-[var(--color-fg-muted)]">{a.motivo}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 px-3 pb-3">
                    <Button size="sm" onClick={() => confirmar(a)}>Confirmar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPreviews(prev => prev.filter((_, j) => j !== i))}>
                      Descartar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function KpiSimplesPage() {
  const [escalas, setEscalas] = useState<File[]>([])
  const [unitrac, setUnitrac] = useState<File | null>(null)
  const [data, setData] = useState<string>(hoje)
  const [alteracoes, setAlteracoes] = useState<AlteracaoParsed[]>([])
  const [redes, setRedes] = useState<RedeResult[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function addAlteracao(a: AlteracaoParsed) { setAlteracoes(prev => [...prev, a]) }
  function removeAlteracao(idx: number) { setAlteracoes(prev => prev.filter((_, i) => i !== idx)) }

  function addEscalas(files: File[]) {
    if (files.length === 0) return
    setEscalas(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...files.filter(f => !names.has(f.name))]
    })
  }

  async function uploadComPresign(file: File, isUnitrac: boolean): Promise<string> {
    const endpoint = isUnitrac ? '/api/unitrac/presign' : '/api/escalas/presign'
    const body = isUnitrac
      ? { data, filename: file.name }
      : { data, filename: file.name, tipo: 'auto' }

    const presignRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!presignRes.ok) throw new Error(`Presign falhou: ${await presignRes.text()}`)
    const { signedUrl, path } = await presignRes.json() as { signedUrl: string; path: string }

    const ext = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'xlsx'
    const contentType = ext === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

    const putRes = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
    if (!putRes.ok) throw new Error(`Upload falhou (${putRes.status}): ${putRes.statusText}`)
    return path
  }

  async function processar() {
    if (escalas.length === 0) { setErro('Selecione ao menos uma escala.'); return }
    if (!unitrac) { setErro('Selecione o Unitrac.'); return }
    if (!data) { setErro('Selecione a data.'); return }

    setErro(null)
    setRedes(null)

    startTransition(async () => {
      try {
        const [escalaBucketPaths, unitracBucketPath] = await Promise.all([
          Promise.all(escalas.map(f => uploadComPresign(f, false))),
          uploadComPresign(unitrac, true),
        ])

        const res = await fetch('/api/kpi/simples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ escalaBucketPaths, unitracBucketPath, data, alteracoes }),
        })
        if (!res.ok) throw new Error((await res.text()) || 'Erro ao processar.')
        const json = await res.json() as { redes: RedeResult[] }
        setRedes(json.redes)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro inesperado.')
      }
    })
  }

  const pronto = escalas.length > 0 && unitrac !== null && !!data

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      {/* Saudação editorial */}
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          KPI Benassi
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Geração Simples
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba escalas (GERAL, PAX, ZONA SUL, GUANABARA PDF) e o relatório Unitrac.
          Em alguns segundos você recebe um XLSX e PDF por rede.
        </p>
      </header>

      {/* Upload grid asymmetric — escalas 7/12 (mais peso) + Unitrac+data 5/12 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <FileDropzone
          className="col-span-1 lg:col-span-7"
          eyebrow="Passo 1"
          label="Escalas do dia"
          hint="XLSX ou PDF · pode subir várias"
          accept=".xlsx,.pdf"
          multiple
          files={escalas}
          onAdd={addEscalas}
          onRemove={i => setEscalas(prev => prev.filter((_, j) => j !== i))}
        />

        <div className="col-span-1 flex flex-col gap-4 lg:col-span-5">
          <FileDropzone
            eyebrow="Passo 2"
            label="Relatório Unitrac"
            hint="XLSX ou PDF · um arquivo"
            accept=".xlsx,.pdf"
            files={unitrac ? [unitrac] : []}
            onAdd={files => setUnitrac(files[0] ?? null)}
            onRemove={() => setUnitrac(null)}
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

      {/* Alterações (componente preservado) */}
      <div className="mt-6">
        <AlteracoesCard confirmadas={alteracoes} onConfirm={addAlteracao} onRemove={removeAlteracao} />
      </div>

      {/* Error inline */}
      {erro && (
        <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <p className="text-[13px] leading-relaxed text-[var(--color-danger-soft-fg)]">{erro}</p>
        </div>
      )}

      {/* CTA hero — botão grande tactile */}
      <button
        type="button"
        onClick={processar}
        disabled={pending || !pronto}
        className={cn(
          'group mt-8 flex w-full items-center justify-between gap-4 rounded-[var(--radius-card)] px-7 py-5 text-left transition-all duration-200 active:scale-[0.997]',
          pronto && !pending
            ? 'bg-[var(--color-navy-700)] text-white hover:opacity-90'
            : 'cursor-not-allowed bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[var(--color-fg-muted)]'
        )}
      >
        <div className="flex flex-col gap-1">
          <span
            className={cn(
              'text-[11px] font-medium uppercase tracking-[0.18em]',
              pronto && !pending
                ? 'text-white/60'
                : 'text-[var(--color-fg-muted)]'
            )}
          >
            {pending ? 'Processando' : 'Gerar KPIs'}
          </span>
          <span className="text-[18px] font-semibold tracking-tight">
            {pending
              ? 'Processando arquivos…'
              : pronto
                ? `Gerar agora${escalas.length > 1 ? ` · ${escalas.length} escalas` : ''}${alteracoes.length > 0 ? ` · ${alteracoes.length} alt.` : ''}`
                : 'Aguardando arquivos'}
          </span>
        </div>
        {!pending && pronto && (
          <ArrowRight
            size={22}
            weight="bold"
            className="shrink-0 transition-transform duration-200 group-hover:translate-x-1"
          />
        )}
        {pending && (
          <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
        )}
      </button>

      {/* Empty result */}
      {redes && redes.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-12 text-center">
          <ChartBarHorizontal size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
          <p className="text-[14px] text-[var(--color-fg-muted)]">
            Nenhuma rede encontrada. Verifique os arquivos enviados.
          </p>
        </div>
      )}

      {/* Resultado — preview completo por rede */}
      {redes && redes.length > 0 && (
        <section className="mt-12 space-y-8">
          <div className="flex items-baseline justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
                Pré-visualização KPI
              </span>
              <h2 className="text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
                {redes.length} rede{redes.length === 1 ? '' : 's'} processada{redes.length === 1 ? '' : 's'}
              </h2>
            </div>
            <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">
              {data}
            </span>
          </div>

          {redes.map(r => (
            <RedePreviewSection key={r.rede_id} rede={r} data={data} />
          ))}
        </section>
      )}
    </div>
  )
}

// ─── File dropzone ──────────────────────────────────────────────────────────

interface FileDropzoneProps {
  className?: string
  eyebrow: string
  label: string
  hint: string
  accept: string
  multiple?: boolean
  files: File[]
  onAdd: (files: File[]) => void
  onRemove: (idx: number) => void
}

function FileDropzone({ className, eyebrow, label, hint, accept, multiple, files, onAdd, onRemove }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length > 0) onAdd(dropped)
  }, [onAdd])

  const hasFiles = files.length > 0

  return (
    <div className={className}>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'group relative flex min-h-[170px] cursor-pointer flex-col justify-between gap-4 overflow-hidden rounded-[var(--radius-card)] border border-dashed bg-[var(--color-bg-elevated)] p-5 transition-all duration-200',
          dragging
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]/40'
            : 'border-[var(--color-border-strong)] hover:border-[var(--color-fg-muted)]'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={e => {
            const picked = Array.from(e.target.files ?? [])
            if (picked.length > 0) onAdd(picked)
            e.target.value = ''
          }}
        />

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
              <UploadSimple size={12} weight="bold" />
              {eyebrow}
            </div>
            <h3 className="mt-2 text-[18px] font-semibold tracking-tight text-[var(--color-fg)]">{label}</h3>
            <p className="mt-0.5 text-[12px] text-[var(--color-fg-muted)]">{hint}</p>
          </div>
          {!hasFiles && (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-muted)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:text-[var(--color-fg)]">
              <UploadSimple size={16} weight="bold" />
            </span>
          )}
        </div>

        {!hasFiles && (
          <p className="text-[12px] italic text-[var(--color-fg-subtle)]">
            Arraste o arquivo aqui ou clique para escolher
          </p>
        )}

        {hasFiles && (
          <ul className="flex flex-col gap-1.5">
            {files.map((f, i) => (
              <li
                key={f.name + i}
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
              >
                {f.name.toLowerCase().endsWith('.pdf') ? (
                  <FilePdf size={16} weight="bold" className="shrink-0 text-[var(--color-danger)]" />
                ) : (
                  <FileXls size={16} weight="bold" className="shrink-0 text-[var(--color-success)]" />
                )}
                <span className="flex-1 truncate text-[12.5px] font-medium text-[var(--color-fg)]">
                  {f.name}
                </span>
                <span className="text-numeric text-[11px] text-[var(--color-fg-subtle)]">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onRemove(i) }}
                  aria-label={`Remover ${f.name}`}
                  className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"
                >
                  <X size={12} weight="bold" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Rede preview section ────────────────────────────────────────────────────

function ParecerIAInline({ texto, erro }: { texto: string | null; erro: string | null }) {
  const [open, setOpen] = useState(false)
  const temConteudo = !!texto

  return (
    <div className="border-b border-[var(--color-border)]">
      <button
        type="button"
        onClick={() => { if (temConteudo) setOpen(v => !v) }}
        disabled={!temConteudo}
        className={cn(
          'w-full flex items-center justify-between px-5 py-2.5 text-[11px] font-medium transition-colors',
          temConteudo ? 'hover:bg-[var(--color-bg-hover)] cursor-pointer text-[var(--color-fg-muted)]' : 'cursor-default text-[var(--color-fg-subtle)]',
        )}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <Robot size={13} weight="bold" className={erro ? 'text-[var(--color-danger)] shrink-0' : 'text-[var(--color-accent)] shrink-0'} />
          <span className="shrink-0">Parecer IA</span>
          {erro && <span className="text-[10px] text-[var(--color-danger)] truncate">· {erro}</span>}
        </span>
        {temConteudo && (
          <CaretDown
            size={12}
            weight="bold"
            className={cn('transition-transform duration-200 shrink-0', open && 'rotate-180')}
          />
        )}
      </button>
      {open && texto && (
        <div className="px-5 py-3 text-[12px] text-[var(--color-fg)] leading-relaxed whitespace-pre-wrap bg-[var(--color-bg-subtle)] border-t border-[var(--color-border)]">
          {texto}
        </div>
      )}
    </div>
  )
}

function RedePreviewSection({ rede, data }: { rede: RedeResult; data: string }) {
  const cobertura = rede.qtd_rotas > 0
    ? Math.round(((rede.qtd_rotas - rede.qtd_sem_gps) / rede.qtd_rotas) * 100)
    : 0
  const tomCobertura =
    cobertura >= 80 ? 'success' : cobertura >= 50 ? 'warning' : 'danger'

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      {/* Header da rede */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
              {rede.rede_nome}
            </h3>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">
              {rede.qtd_rotas} rota{rede.qtd_rotas !== 1 ? 's' : ''} · GPS{' '}
              <span
                className={cn(
                  'text-numeric',
                  tomCobertura === 'success' && 'text-[var(--color-success)]',
                  tomCobertura === 'warning' && 'text-[var(--color-warning)]',
                  tomCobertura === 'danger' && 'text-[var(--color-danger)]',
                )}
              >
                {cobertura}%
              </span>
              {rede.qtd_sem_gps > 0 && (
                <span className="text-[var(--color-fg-subtle)]"> · {rede.qtd_sem_gps} sem dado</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {tomCobertura === 'success' && <CheckCircle size={16} weight="fill" className="text-[var(--color-success)]" />}
          {tomCobertura !== 'success' && <WarningCircle size={16} weight="fill" className={tomCobertura === 'warning' ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]'} />}
          <button
            type="button"
            onClick={() => downloadBase64(rede.xlsxBase64, `KPI-${rede.rede_id}-${data}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-fg)] transition-all duration-150 active:scale-[0.96] hover:border-[var(--color-navy-700)] hover:bg-[var(--color-navy-700)] hover:text-white"
          >
            <FileArrowDown size={12} weight="bold" />
            <FileXls size={12} weight="bold" />
            XLSX
          </button>
          <button
            type="button"
            onClick={() => downloadBase64(rede.pdfBase64, `KPI-${rede.rede_id}-${data}.pdf`, 'application/pdf')}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-fg)] transition-all duration-150 active:scale-[0.96] hover:border-[var(--color-navy-700)] hover:bg-[var(--color-navy-700)] hover:text-white"
          >
            <FileArrowDown size={12} weight="bold" />
            <FilePdf size={12} weight="bold" />
            PDF
          </button>
        </div>
      </div>

      {/* Barra de cobertura */}
      <div className="h-[2px] bg-[var(--color-bg-subtle)]">
        <div
          className={cn(
            'h-full transition-all duration-700',
            tomCobertura === 'success' && 'bg-[var(--color-success)]',
            tomCobertura === 'warning' && 'bg-[var(--color-warning)]',
            tomCobertura === 'danger' && 'bg-[var(--color-danger)]',
          )}
          style={{ width: `${cobertura}%` }}
        />
      </div>

      {/* Parecer IA — sempre visível; erro quando API key ausente */}
      <ParecerIAInline texto={rede.analise_ia} erro={rede.analise_ia_erro} />

      {/* Tabela de preview */}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] w-8">#</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Loja</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Placa</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden sm:table-cell">Motorista</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] w-14">GPS</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden md:table-cell">Saída CD</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden md:table-cell">Ch. Loja</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)] hidden lg:table-cell">Tempo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rede.preview.map(linha => (
              <PreviewRow key={linha.ordem} linha={linha} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PreviewRow({ linha }: { linha: PreviewLinha }) {
  const semGps = !linha.tem_gps

  return (
    <tr
      className={cn(
        'transition-colors duration-100',
        semGps
          ? 'bg-[var(--color-danger-soft)] hover:bg-[var(--color-danger-soft)]'
          : 'hover:bg-[var(--color-bg-hover)]',
      )}
    >
      <td className="px-4 py-2.5 text-numeric text-[var(--color-fg-subtle)]">
        {linha.ordem}
      </td>
      <td className="px-4 py-2.5 font-medium text-[var(--color-fg)] max-w-[200px]">
        <span className="block truncate">{linha.loja_nome}</span>
      </td>
      <td className="px-4 py-2.5 text-numeric text-[var(--color-fg)]">
        {linha.placa
          ? `${linha.placa.slice(0, 3)}-${linha.placa.slice(3)}`
          : <span className="text-[var(--color-fg-subtle)]">—</span>}
      </td>
      <td className="px-4 py-2.5 text-[var(--color-fg-muted)] hidden sm:table-cell max-w-[140px]">
        <span className="block truncate">{linha.motorista ?? '—'}</span>
      </td>
      <td className="px-4 py-2.5 text-center">
        {linha.tem_gps
          ? <WifiHigh size={14} weight="bold" className="mx-auto text-[var(--color-success)]" />
          : <WifiSlash size={14} weight="bold" className="mx-auto text-[var(--color-danger)]" />}
      </td>
      <td className="px-4 py-2.5 text-numeric text-[var(--color-fg-muted)] hidden md:table-cell">
        {linha.saida_cd_fmt ?? <span className="text-[var(--color-fg-subtle)]">—</span>}
      </td>
      <td className="px-4 py-2.5 text-numeric text-[var(--color-fg-muted)] hidden md:table-cell">
        {linha.chegada_loja_fmt ?? <span className="text-[var(--color-fg-subtle)]">—</span>}
      </td>
      <td className="px-4 py-2.5 text-numeric text-right text-[var(--color-fg-muted)] hidden lg:table-cell">
        {linha.tempo_loja_min != null
          ? `${linha.tempo_loja_min} min`
          : <span className="text-[var(--color-fg-subtle)]">—</span>}
      </td>
    </tr>
  )
}
