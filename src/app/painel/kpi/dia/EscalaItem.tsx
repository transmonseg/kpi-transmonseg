'use client'

import { useRef } from 'react'
import { Badge, cn, type BadgeProps } from '@/components/ui'

type EscalaUpload = {
  id: string
  tipo: string
  qtd_linhas: number | null
  created_at: string
}

export type EscalaItemPhase = 'idle' | 'uploading' | 'parsing'

type Props =
  | {
      tipo: string
      upload: EscalaUpload
      onReenviar: (tipo: string, file: File) => void
      phase?: EscalaItemPhase
      erro?: string
      onTentarNovamente?: () => void
    }
  | {
      tipo: string
      upload: null
      onEnviar: (tipo: string, file: File) => void
      phase?: EscalaItemPhase
      erro?: string
      onTentarNovamente?: () => void
    }

// Tonalidade do Badge por rede (mapeia pra variants semânticas)
const BADGE_VARIANT: Record<string, BadgeProps['variant']> = {
  GERAL: 'info',
  ZONA_SUL: 'info',
  PAX: 'danger',
  GUANABARA: 'warning',
  ARMAZEM_GRAO: 'success',
}

// Cor de borda esquerda complementar — dá identidade rápida em scan vertical
const TIPO_BAR: Record<string, string> = {
  GERAL: 'bg-blue-500/70 dark:bg-blue-400/80',
  ZONA_SUL: 'bg-violet-500/70 dark:bg-violet-400/80',
  PAX: 'bg-pink-500/70 dark:bg-pink-400/80',
  GUANABARA: 'bg-amber-500/70 dark:bg-amber-400/80',
  ARMAZEM_GRAO: 'bg-emerald-500/70 dark:bg-emerald-400/80',
}

const LABEL: Record<string, string> = {
  GERAL: 'GERAL',
  ZONA_SUL: 'ZONA SUL',
  PAX: 'PAX',
  GUANABARA: 'GUANABARA',
  ARMAZEM_GRAO: 'ARMAZÉM DO GRÃO',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function Spinner({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}

function Row({
  bar,
  children,
  tone = 'default',
}: {
  bar: string
  children: React.ReactNode
  tone?: 'default' | 'busy' | 'done' | 'error'
}) {
  const toneClasses =
    tone === 'busy'
      ? 'bg-[var(--color-bg-subtle)] border-[var(--color-border)]'
      : tone === 'done'
        ? 'bg-[var(--color-success-soft)]/30 border-[var(--color-border)]'
        : tone === 'error'
          ? 'bg-[var(--color-danger-soft)] border-[var(--color-danger)]/40'
          : 'bg-[var(--color-bg-subtle)] border-[var(--color-border)] border-dashed'

  return (
    <div
      className={cn(
        'relative flex items-center justify-between gap-2 pl-4 pr-3 py-2 rounded-md border',
        toneClasses,
      )}
    >
      <span className={cn('absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full', bar)} />
      {children}
    </div>
  )
}

export function EscalaItem(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const variant = BADGE_VARIANT[props.tipo] ?? 'default'
  const bar = TIPO_BAR[props.tipo] ?? 'bg-[var(--color-border-strong)]'
  const label = LABEL[props.tipo] ?? props.tipo
  const phase = props.phase ?? 'idle'
  const erro = props.erro

  // ERROR
  if (erro && phase === 'idle') {
    return (
      <Row bar={bar} tone="error">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={variant} className="shrink-0">
            {label}
          </Badge>
          <span
            className="text-[12px] text-[var(--color-danger-soft-fg)] truncate"
            title={erro}
          >
            {erro}
          </span>
        </div>
        {props.onTentarNovamente && (
          <button
            onClick={props.onTentarNovamente}
            className="text-[11px] font-medium text-[var(--color-fg)] hover:text-[var(--color-fg)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] rounded-md px-2 py-1 transition-colors cursor-pointer shrink-0"
          >
            Tentar de novo
          </button>
        )}
      </Row>
    )
  }

  // UPLOADING / PARSING
  if (phase === 'uploading' || phase === 'parsing') {
    const msg = phase === 'uploading' ? 'Enviando…' : 'Analisando arquivo…'
    return (
      <Row bar={bar} tone="busy">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={variant} className="shrink-0">
            {label}
          </Badge>
          <span className="text-[12px] text-[var(--color-fg-muted)] flex items-center gap-1.5">
            <Spinner />
            {msg}
          </span>
        </div>
      </Row>
    )
  }

  // DONE
  if (props.upload) {
    const { upload, onReenviar } = props
    return (
      <Row bar={bar} tone="done">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={variant} className="shrink-0">
            {label}
          </Badge>
          <span className="text-[12px] font-medium text-[var(--color-fg)] tabular-nums">
            {upload.qtd_linhas ?? '?'} linhas
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-success-soft-fg)] font-medium tabular-nums">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="h-3 w-3"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 8.5 7 12.5 13 4.5" />
            </svg>
            {formatTime(upload.created_at)}
          </span>
          <button
            onClick={() => inputRef.current?.click()}
            title="Reenviar"
            className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-hover)] rounded px-1.5 py-0.5 text-[13px] transition-colors cursor-pointer"
          >
            ↺
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onReenviar(props.tipo, f)
              e.target.value = ''
            }}
            className="hidden"
          />
        </div>
      </Row>
    )
  }

  // NOT_SENT
  const { onEnviar } = props
  return (
    <Row bar={bar} tone="default">
      <div className="flex items-center gap-2 min-w-0">
        <Badge variant="default" className="shrink-0 opacity-70">
          {label}
        </Badge>
        <span className="text-[12px] text-[var(--color-fg-subtle)]">não enviada</span>
      </div>
      <button
        onClick={() => inputRef.current?.click()}
        className="text-[11px] font-medium text-[var(--color-fg)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] rounded-md px-2 py-1 transition-colors cursor-pointer shrink-0"
      >
        + Enviar
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.pdf"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onEnviar(props.tipo, f)
          e.target.value = ''
        }}
        className="hidden"
      />
    </Row>
  )
}
