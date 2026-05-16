'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge, Button, Card, cn } from '@/components/ui'
import { DropZone } from './DropZone'
import { EscalaItem } from './EscalaItem'
import { GerarSection } from './GerarSection'
import { AlteracaoInline } from './AlteracaoInline'
import { KpisGerados } from './KpisGerados'

type EscalaUpload = {
  id: string
  tipo: string
  qtd_linhas: number | null
  created_at: string
}

type Props = {
  data: string
  hoje: string
  escalasIniciais: EscalaUpload[]
  todosTipos: string[]
}

export function traduzErro(msg: string): string {
  const lower = msg.toLowerCase()
  if (
    lower.includes('function_payload_too_large') ||
    lower.includes('payload_too_large') ||
    lower.includes('413')
  ) {
    return 'Arquivo grande demais (máx ~4.5MB)'
  }
  if (
    lower.includes('não foi possível detectar') ||
    lower.includes('nao foi possivel detectar')
  ) {
    return 'Não foi possível detectar o tipo da escala. Verifique o arquivo.'
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error')
  ) {
    return 'Sem conexão, tente de novo'
  }
  if (
    /\b5\d{2}\b/.test(msg) ||
    lower.includes('internal server error') ||
    lower.includes('bad gateway') ||
    lower.includes('service unavailable')
  ) {
    return 'Erro do servidor, tente de novo'
  }
  if (lower.startsWith('error:')) return msg.slice(6).trim()
  return msg.length > 140 ? msg.slice(0, 137) + '…' : msg
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

function StatusPill({
  tone,
  label,
}: {
  tone: 'success' | 'warning' | 'danger' | 'info' | 'muted'
  label: React.ReactNode
}) {
  const map: Record<string, string> = {
    success:
      'bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)] border-transparent',
    warning:
      'bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)] border-transparent',
    danger:
      'bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)] border-transparent',
    info: 'bg-[var(--color-info-soft)] text-[var(--color-info-soft-fg)] border-transparent',
    muted:
      'bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] border-[var(--color-border)]',
  }
  const dot: Record<string, string> = {
    success: 'bg-[var(--color-success)]',
    warning: 'bg-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger)]',
    info: 'bg-[var(--color-info)]',
    muted: 'bg-[var(--color-fg-subtle)]',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] font-medium rounded-md px-2 py-1 border tabular-nums',
        map[tone],
      )}
    >
      <span className={cn('inline-block w-1.5 h-1.5 rounded-full', dot[tone])} />
      {label}
    </span>
  )
}

export function DiaPage({
  data: dataInicial,
  hoje,
  escalasIniciais,
  todosTipos,
}: Props) {
  const router = useRouter()
  const [data, setData] = useState(dataInicial)
  const [escalas, setEscalas] = useState<EscalaUpload[]>(escalasIniciais)
  const [uploadingTipos, setUploadingTipos] = useState<Set<string>>(new Set())
  const [parsingTipos, setParsingTipos] = useState<Set<string>>(new Set())
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const [loadingEscalas, setLoadingEscalas] = useState(false)
  const [unitracSentAt, setUnitracSentAt] = useState<string | null>(null)
  const [kpisRefreshKey, setKpisRefreshKey] = useState(0)
  const [previewData, setPreviewData] = useState<{
    tipo_detectado: string
    total_linhas: number
    linhas_validas: unknown[]
    linhas_problematicas: Array<{ linha: number; motivo: string; conteudo: string }>
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  async function navegarPara(novaData: string) {
    setData(novaData)
    setUnitracSentAt(null)
    setUploadErrors({})
    router.push(`/painel/kpi/dia?data=${novaData}`)
    setLoadingEscalas(true)
    try {
      const res = await fetch(`/api/escalas/dia?data=${novaData}`)
      if (res.ok) setEscalas(await res.json())
      else setEscalas([])
    } catch {
      setEscalas([])
    } finally {
      setLoadingEscalas(false)
    }
  }

  async function uploadArquivo(file: File, tipoExplicito: string) {
    const ext = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'xlsx'
    const contentType =
      ext === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    const storagePath = `${data}/${tipoExplicito.toLowerCase()}_${Date.now()}.${ext}`

    const sb = createClient()
    const { error: storageErr } = await sb.storage
      .from('escalas-raw')
      .upload(storagePath, file, { contentType, upsert: true })
    if (storageErr) throw new Error(storageErr.message)

    return { storagePath, tipoExplicito }
  }

  async function parseArquivo(storagePath: string, tipoExplicito: string) {
    const res = await fetch('/api/escalas/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: tipoExplicito.toUpperCase(),
        data,
        storagePath,
      }),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json() as Promise<{ tipo_detectado?: string }>
  }

  async function recarregarEscalas() {
    try {
      const res = await fetch(`/api/escalas/dia?data=${data}`)
      if (res.ok) setEscalas(await res.json())
    } catch {
      // silencioso
    }
  }

  async function processarUpload(key: string, file: File, tipo: string) {
    setUploadErrors((prev) => {
      const e = { ...prev }
      delete e[key]
      return e
    })

    // Preview de validação — roda antes do upload real
    setPreviewData(null)
    setPreviewLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (tipo !== 'auto') fd.append('tipo', tipo)
      fd.append('data', data)
      const res = await fetch('/api/escalas/preview', { method: 'POST', body: fd })
      if (res.ok) {
        const pv = await res.json()
        setPreviewData(pv)
      }
    } catch (e) {
      console.error('Erro no preview de escala:', e)
    } finally {
      setPreviewLoading(false)
    }

    setUploadingTipos((prev) => new Set([...prev, key]))
    try {
      const { storagePath } = await uploadArquivo(file, tipo)
      setUploadingTipos((prev) => {
        const s = new Set(prev)
        s.delete(key)
        return s
      })
      setParsingTipos((prev) => new Set([...prev, key]))
      await parseArquivo(storagePath, tipo)
      await recarregarEscalas()
    } catch (e) {
      setUploadErrors((prev) => ({
        ...prev,
        [key]: traduzErro(e instanceof Error ? e.message : String(e)),
      }))
    } finally {
      setUploadingTipos((prev) => {
        const s = new Set(prev)
        s.delete(key)
        return s
      })
      setParsingTipos((prev) => {
        const s = new Set(prev)
        s.delete(key)
        return s
      })
    }
  }

  async function handleFiles(files: File[]) {
    await Promise.all(
      files.map(async (file, i) => {
        const key = 'AUTO_' + file.name + '_' + Date.now() + '_' + i
        await processarUpload(key, file, 'auto')
      }),
    )
  }

  async function handleEnviarTipo(tipo: string, file: File) {
    await processarUpload(tipo, file, tipo)
  }

  function tentarNovamenteTipo(tipo: string) {
    setUploadErrors((prev) => {
      const e = { ...prev }
      delete e[tipo]
      return e
    })
  }

  const isHoje = data === hoje
  const dataLabel = formatDate(data)
  const autoUploads = useMemo(
    () =>
      [...uploadingTipos, ...parsingTipos].filter((k) => k.startsWith('AUTO_')),
    [uploadingTipos, parsingTipos],
  )
  const autoUploading = autoUploads.length > 0

  // Status strip
  const escalasCount = escalas.length
  const escalasTotal = todosTipos.length
  const escalasTone: 'success' | 'warning' | 'danger' =
    escalasCount === 0
      ? 'danger'
      : escalasCount === escalasTotal
        ? 'success'
        : 'warning'

  const unitracTone: 'success' | 'info' = unitracSentAt ? 'success' : 'info'
  const prontoPraGerar = escalasCount >= 1
  const prontoTone: 'success' | 'muted' = prontoPraGerar ? 'success' : 'muted'

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-3">
      {/* Header — data navigator */}
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navegarPara(shiftDay(data, -1))}
              aria-label="Dia anterior"
            >
              ←
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[13px] font-semibold text-[var(--color-fg)] capitalize truncate">
                {dataLabel}
              </span>
              {isHoje && <Badge variant="info">hoje</Badge>}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navegarPara(shiftDay(data, 1))}
              disabled={isHoje}
              aria-label="Próximo dia"
            >
              →
            </Button>
          </div>
          <input
            type="date"
            value={data}
            max={hoje}
            onChange={(e) => navegarPara(e.target.value)}
            className="hidden sm:block h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2 text-[12px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
        </div>
      </Card>

      {/* Status pills */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill
          tone={escalasTone}
          label={
            <span>
              {escalasCount}/{escalasTotal} escalas
            </span>
          }
        />
        <StatusPill
          tone={unitracTone}
          label={
            unitracSentAt
              ? `Unitrac enviado ${formatTime(unitracSentAt)}`
              : 'Unitrac pendente'
          }
        />
        <StatusPill
          tone={prontoTone}
          label={prontoPraGerar ? 'Pronto para gerar' : 'Aguardando escalas'}
        />
      </div>

      {/* 1. Escalas do dia */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--color-border)]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
            Escalas do dia
          </p>
          <Badge variant="default">
            {escalasCount}/{escalasTotal}
          </Badge>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <DropZone
            onFiles={handleFiles}
            uploading={autoUploading}
            uploadingCount={autoUploads.length}
            variant="escalas"
          />

          {previewLoading && (
            <p className="text-[12px] text-[var(--color-fg-muted)] animate-pulse">
              Validando arquivo...
            </p>
          )}
          {previewData && previewData.linhas_problematicas.length > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2.5 dark:border-yellow-700/50 dark:bg-yellow-900/20">
              <p className="text-[12px] font-semibold text-yellow-800 dark:text-yellow-300">
                {previewData.linhas_problematicas.length} linha(s) com problema
              </p>
              <ul className="mt-1 space-y-0.5">
                {previewData.linhas_problematicas.slice(0, 5).map((p, i) => (
                  <li key={i} className="text-[11px] text-yellow-700 dark:text-yellow-400">
                    Linha {p.linha}: {p.motivo}
                  </li>
                ))}
                {previewData.linhas_problematicas.length > 5 && (
                  <li className="text-[11px] text-yellow-600 dark:text-yellow-500">
                    +{previewData.linhas_problematicas.length - 5} outros problemas
                  </li>
                )}
              </ul>
              <p className="mt-1.5 text-[11px] text-yellow-600 dark:text-yellow-500">
                Revise o arquivo antes de confirmar.
              </p>
            </div>
          )}
          {previewData && previewData.linhas_problematicas.length === 0 && (
            <p className="text-[12px] text-[var(--color-success-soft-fg)]">
              Arquivo válido: {previewData.total_linhas} linha(s) detectada(s) — {previewData.tipo_detectado}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {loadingEscalas ? (
              todosTipos.map((t) => (
                <div
                  key={t}
                  className="h-10 rounded-md bg-[var(--color-bg-subtle)] animate-pulse"
                />
              ))
            ) : (
              <>
                {todosTipos.map((tipo) => {
                  const upload = escalas.find((e) => e.tipo === tipo) ?? null
                  const uploading = uploadingTipos.has(tipo)
                  const parsing = parsingTipos.has(tipo)
                  const erro = uploadErrors[tipo]
                  const phase = uploading ? 'uploading' : parsing ? 'parsing' : 'idle'

                  if (upload) {
                    return (
                      <EscalaItem
                        key={tipo}
                        tipo={tipo}
                        upload={upload}
                        onReenviar={handleEnviarTipo}
                        phase={phase}
                        erro={erro}
                        onTentarNovamente={() => tentarNovamenteTipo(tipo)}
                      />
                    )
                  }
                  return (
                    <EscalaItem
                      key={tipo}
                      tipo={tipo}
                      upload={null}
                      onEnviar={handleEnviarTipo}
                      phase={phase}
                      erro={erro}
                      onTentarNovamente={() => tentarNovamenteTipo(tipo)}
                    />
                  )
                })}
              </>
            )}
          </div>

          {Object.entries(uploadErrors)
            .filter(([k]) => k.startsWith('AUTO_'))
            .map(([k, msg]) => (
              <div
                key={k}
                className="rounded-md bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)] flex items-start justify-between gap-2"
              >
                <span className="flex-1">{msg}</span>
                <button
                  onClick={() =>
                    setUploadErrors((prev) => {
                      const e = { ...prev }
                      delete e[k]
                      return e
                    })
                  }
                  className="text-[var(--color-danger-soft-fg)]/70 hover:text-[var(--color-danger-soft-fg)] cursor-pointer shrink-0"
                  title="Dispensar"
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      </Card>

      {/* 2. Alterações inline */}
      <AlteracaoInline data={data} />

      {/* 3. Gerar KPIs */}
      <GerarSection
        data={data}
        escalas={escalas}
        todosTipos={todosTipos}
        onUnitracSent={() => setUnitracSentAt(new Date().toISOString())}
        onGerou={() => setKpisRefreshKey((k) => k + 1)}
        traduzErro={traduzErro}
      />

      {/* 4. KPIs gerados */}
      <KpisGerados data={data} refreshKey={kpisRefreshKey} />
    </div>
  )
}
