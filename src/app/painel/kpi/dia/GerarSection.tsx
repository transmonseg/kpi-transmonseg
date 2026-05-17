'use client'

import { useMemo, useState } from 'react'
import {
  Check,
  X,
  Clock,
  Minus,
  CircleNotch,
  ArrowsClockwise,
} from '@phosphor-icons/react/dist/ssr'
import { Badge, Button, Card, CardContent, cn } from '@/components/ui'
import { DropZone } from './DropZone'

type EscalaUpload = {
  id: string
  tipo: string
  qtd_linhas: number | null
  created_at: string
}

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

type Step = {
  id: string
  label: string
  status: StepStatus
  detail?: string
}

type Props = {
  data: string
  escalas: EscalaUpload[]
  todosTipos: string[]
  onUnitracSent?: () => void
  onGerou?: () => void
  traduzErro?: (msg: string) => string
}

const LABEL: Record<string, string> = {
  GERAL: 'GERAL',
  ZONA_SUL: 'ZONA SUL',
  PAX: 'PAX',
  GUANABARA: 'GUANABARA',
  ARMAZEM_GRAO: 'ARMAZÉM DO GRÃO',
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-success)] shrink-0">
        <Check size={11} weight="bold" className="text-white" />
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-accent-soft)] shrink-0">
        <CircleNotch size={12} weight="bold" className="animate-spin text-[var(--color-accent)]" />
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-danger)] shrink-0">
        <X size={11} weight="bold" className="text-white" />
      </span>
    )
  }
  if (status === 'skipped') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-bg-subtle)] shrink-0 border border-[var(--color-border)]">
        <Minus size={11} weight="bold" className="text-[var(--color-fg-subtle)]" />
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-bg-subtle)] shrink-0 border border-[var(--color-border)]">
      <Clock size={11} weight="bold" className="text-[var(--color-fg-subtle)]" />
    </span>
  )
}

export function GerarSection({
  data,
  escalas,
  todosTipos,
  onUnitracSent,
  onGerou,
  traduzErro,
}: Props) {
  const tiposComEscala = useMemo(
    () => todosTipos.filter((t) => escalas.some((e) => e.tipo === t)),
    [todosTipos, escalas],
  )

  const tiposKey = tiposComEscala.join('|')
  const [prevTiposKey, setPrevTiposKey] = useState(tiposKey)
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(tiposComEscala),
  )
  if (prevTiposKey !== tiposKey) {
    setPrevTiposKey(tiposKey)
    setSelecionados((prev) => {
      const next = new Set<string>()
      for (const t of tiposComEscala) if (prev.has(t)) next.add(t)
      return next.size > 0 ? next : new Set(tiposComEscala)
    })
  }

  const [unitracFile, setUnitracFile] = useState<File | null>(null)
  const [gerando, setGerando] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [erroGerar, setErroGerar] = useState<string>('')

  const traduz = traduzErro ?? ((m: string) => m)

  function toggleRede(tipo: string) {
    setSelecionados((prev) => {
      const s = new Set(prev)
      if (s.has(tipo)) s.delete(tipo)
      else s.add(tipo)
      return s
    })
  }

  function marcarTodas() {
    setSelecionados(new Set(tiposComEscala))
  }
  function desmarcarTodas() {
    setSelecionados(new Set())
  }

  function setStep(id: string, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function handleUnitracDrop(files: File[]) {
    const f = files[0]
    if (f) setUnitracFile(f)
  }

  async function handleGerar() {
    if (!unitracFile || selecionados.size === 0) return
    setGerando(true)
    setErroGerar('')

    const redesSelecionadas = todosTipos.filter((t) => selecionados.has(t))
    const initialSteps: Step[] = [
      { id: 'upload_unitrac', label: 'Enviar Unitrac', status: 'pending' },
      { id: 'process_gps', label: 'Processar GPS', status: 'pending' },
      ...redesSelecionadas.flatMap((t) => [
        {
          id: `processar_${t}`,
          label: `Processar ${LABEL[t] ?? t}`,
          status: 'pending' as StepStatus,
        },
        {
          id: `gerar_${t}`,
          label: `Gerar ${LABEL[t] ?? t}`,
          status: 'pending' as StepStatus,
        },
      ]),
    ]
    setSteps(initialSteps)

    let geracaoAconteceu = false

    try {
      setSteps((prev) =>
        prev.map((s) =>
          s.id === 'upload_unitrac' ? { ...s, status: 'running' } : s,
        ),
      )
      const ext = unitracFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'xlsx'
      const contentType =
        ext === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

      const presignRes = await fetch('/api/unitrac/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, filename: unitracFile.name }),
      })
      if (!presignRes.ok) {
        setStep('upload_unitrac', { status: 'error' })
        throw new Error(`Erro ao obter URL de upload: ${await presignRes.text()}`)
      }
      const { signedUrl, path: storagePath } = await presignRes.json() as {
        signedUrl: string
        path: string
      }

      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: unitracFile,
      })
      if (!putRes.ok) {
        setStep('upload_unitrac', { status: 'error' })
        throw new Error(`Erro ao enviar Unitrac: ${putRes.status} ${putRes.statusText}`)
      }
      setStep('upload_unitrac', { status: 'done' })

      setStep('process_gps', { status: 'running' })
      const unitracRes = await fetch('/api/unitrac/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, storagePath }),
      })
      if (!unitracRes.ok) {
        setStep('process_gps', { status: 'error' })
        throw new Error(await unitracRes.text())
      }
      setStep('process_gps', { status: 'done' })
      onUnitracSent?.()

      for (const tipo of redesSelecionadas) {
        setStep(`processar_${tipo}`, { status: 'running' })

        const processarRes = await fetch('/api/kpi/processar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, tipo }),
        })
        if (!processarRes.ok) {
          setStep(`processar_${tipo}`, {
            status: 'error',
            detail: traduz(await processarRes.text()),
          })
          setStep(`gerar_${tipo}`, { status: 'skipped' })
          continue
        }
        const { kpi_ids } = (await processarRes.json()) as { kpi_ids: string[] }
        setStep(`processar_${tipo}`, { status: 'done' })

        if (!kpi_ids || kpi_ids.length === 0) {
          setStep(`gerar_${tipo}`, { status: 'skipped', detail: 'Sem dados' })
          continue
        }

        setStep(`gerar_${tipo}`, { status: 'running' })
        let geracaoOk = false

        for (const kpi_id of kpi_ids) {
          const gerarRes = await fetch('/api/kpi/gerar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kpi_id }),
          })

          if (!gerarRes.ok) {
            const text = await gerarRes.text()
            setStep(`gerar_${tipo}`, { status: 'error', detail: traduz(text) })
            throw new Error(`Erro ao gerar ${LABEL[tipo] ?? tipo}: ${text}`)
          }

          geracaoOk = true
          geracaoAconteceu = true
        }

        if (geracaoOk) {
          setStep(`gerar_${tipo}`, { status: 'done' })
        }
      }
    } catch (e) {
      setErroGerar(traduz(e instanceof Error ? e.message : String(e)))
    } finally {
      setGerando(false)
      if (geracaoAconteceu) onGerou?.()
    }
  }

  function resetar() {
    setUnitracFile(null)
    setSteps([])
    setErroGerar('')
  }

  const podeGerar = unitracFile !== null && selecionados.size > 0 && !gerando
  const semEscalas = tiposComEscala.length === 0
  const concluido = steps.length > 0 && !gerando

  return (
    <Card>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
            Gerar KPIs
          </p>
          {tiposComEscala.length > 0 && (
            <Badge variant="default">
              {selecionados.size}/{tiposComEscala.length} selecionada
              {selecionados.size === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
        {tiposComEscala.length > 0 && !gerando && !concluido && (
          <div className="flex gap-3">
            <button
              onClick={marcarTodas}
              className="text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] underline underline-offset-2 cursor-pointer"
            >
              marcar todas
            </button>
            <button
              onClick={desmarcarTodas}
              className="text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] underline underline-offset-2 cursor-pointer"
            >
              desmarcar
            </button>
          </div>
        )}
      </div>

      <CardContent className="flex flex-col gap-3">
        {/* Steps timeline */}
        {steps.length > 0 && (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3 flex flex-col gap-1.5">
            {steps.map((step) => (
              <div key={step.id} className="flex items-center gap-2.5 text-[12px]">
                <StepIcon status={step.status} />
                <span
                  className={cn(
                    'flex-1',
                    step.status === 'done' && 'text-[var(--color-fg-muted)]',
                    step.status === 'running' && 'text-[var(--color-fg)] font-medium',
                    step.status === 'error' && 'text-[var(--color-danger-soft-fg)] font-medium',
                    step.status === 'skipped' && 'text-[var(--color-fg-subtle)] line-through',
                    step.status === 'pending' && 'text-[var(--color-fg-subtle)]',
                  )}
                >
                  {step.label}
                </span>
                {step.detail && (
                  <span
                    className={cn(
                      'text-[10px]',
                      step.status === 'error'
                        ? 'text-[var(--color-danger-soft-fg)]'
                        : 'text-[var(--color-fg-subtle)]',
                    )}
                  >
                    {step.detail}
                  </span>
                )}
              </div>
            ))}
            {concluido && (
              <div className="pt-1 mt-1 border-t border-[var(--color-border)] flex items-center gap-1.5">
                <ArrowsClockwise size={12} weight="bold" className="text-[var(--color-fg-muted)]" />
                <button
                  onClick={resetar}
                  className="text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] underline underline-offset-2 cursor-pointer"
                >
                  Gerar novamente
                </button>
              </div>
            )}
          </div>
        )}

        {/* Seleção de redes */}
        {!gerando && !concluido && (
          <>
            {semEscalas ? (
              <p className="text-[12px] text-[var(--color-fg-muted)] py-1">
                Envie ao menos uma escala para gerar KPIs.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {todosTipos.map((tipo) => {
                  const temEscala = tiposComEscala.includes(tipo)
                  const checked = selecionados.has(tipo)
                  return (
                    <label
                      key={tipo}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md border transition-colors',
                        temEscala
                          ? 'bg-[var(--color-bg)] border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] cursor-pointer'
                          : 'bg-[var(--color-bg-subtle)] border-dashed border-[var(--color-border)] cursor-default opacity-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!temEscala}
                        onChange={() => temEscala && toggleRede(tipo)}
                        className="accent-[var(--color-accent)] w-3.5 h-3.5"
                      />
                      <span className="text-[12px] font-medium text-[var(--color-fg)] flex-1">
                        {LABEL[tipo] ?? tipo}
                      </span>
                      {temEscala ? (
                        <span className="text-[11px] text-[var(--color-fg-muted)] tabular-nums">
                          {escalas.find((e) => e.tipo === tipo)?.qtd_linhas ?? '?'} linhas
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--color-fg-subtle)]">
                          sem escala
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Unitrac picker */}
        {!gerando && !concluido && (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[12px] font-medium text-[var(--color-fg)]">
                Relatório Unitrac
              </span>
              <Badge variant="warning">obrigatório</Badge>
            </div>
            {unitracFile ? (
              <div className="flex items-center justify-between bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-3 py-2">
                <span className="text-[12px] font-medium text-[var(--color-fg)] flex items-center gap-2 min-w-0">
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-muted)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="truncate" title={unitracFile.name}>
                    {unitracFile.name}
                  </span>
                </span>
                <button
                  onClick={() => setUnitracFile(null)}
                  className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] cursor-pointer shrink-0 ml-2 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
                  title="Remover"
                >
                  <X size={13} weight="bold" />
                </button>
              </div>
            ) : (
              <DropZone
                onFiles={handleUnitracDrop}
                variant="unitrac"
                hint=".pdf preferido · .xlsx aceito · não fica salvo no sistema"
              />
            )}
          </div>
        )}

        {erroGerar && (
          <div className="rounded-md bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 px-3 py-2 text-[12px] text-[var(--color-danger-soft-fg)] flex items-start justify-between gap-2">
            <span className="flex-1">{erroGerar}</span>
            <button
              onClick={() => setErroGerar('')}
              className="text-[var(--color-danger-soft-fg)]/70 hover:text-[var(--color-danger-soft-fg)] cursor-pointer shrink-0 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-[var(--color-danger)]/10 transition-colors"
              title="Dispensar"
            >
              <X size={13} weight="bold" />
            </button>
          </div>
        )}

        {!gerando && !concluido && (
          <Button
            variant="primary"
            size="lg"
            onClick={handleGerar}
            disabled={!podeGerar}
            fullWidth
          >
            {podeGerar
              ? `Gerar ${selecionados.size} KPI${selecionados.size > 1 ? 's' : ''}`
              : !unitracFile
                ? 'Anexe o Unitrac para continuar'
                : 'Selecione ao menos uma rede'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
