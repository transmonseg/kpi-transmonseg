'use client'

import { useRef } from 'react'

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

const BADGE_CLASSES: Record<string, string> = {
  GERAL:        'bg-blue-100 text-blue-800',
  ZONA_SUL:     'bg-violet-100 text-violet-800',
  PAX:          'bg-pink-100 text-pink-800',
  GUANABARA:    'bg-amber-100 text-amber-800',
  ARMAZEM_GRAO: 'bg-emerald-100 text-emerald-800',
}

const LABEL: Record<string, string> = {
  GERAL:        'GERAL',
  ZONA_SUL:     'ZONA SUL',
  PAX:          'PAX',
  GUANABARA:    'GUANABARA',
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

export function EscalaItem(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const badge = BADGE_CLASSES[props.tipo] ?? 'bg-slate-100 text-slate-700'
  const label = LABEL[props.tipo] ?? props.tipo
  const phase = props.phase ?? 'idle'
  const erro = props.erro

  // Estado ERROR (qualquer caso): mostra mensagem + tentar de novo
  if (erro && phase === 'idle') {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge} shrink-0`}>{label}</span>
          <span className="text-xs text-red-700 truncate" title={erro}>{erro}</span>
        </div>
        {props.onTentarNovamente && (
          <button
            onClick={props.onTentarNovamente}
            className="text-[11px] font-semibold text-red-700 border border-red-200 bg-white hover:bg-red-50 rounded-md px-2.5 py-1 transition-all duration-150 cursor-pointer shrink-0"
          >
            Tentar de novo
          </button>
        )}
      </div>
    )
  }

  // Estado UPLOADING/PARSING: spinner inline
  if (phase === 'uploading' || phase === 'parsing') {
    const msg = phase === 'uploading' ? 'Enviando…' : 'Analisando arquivo…'
    return (
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-brand-50 border border-brand-200 animate-pulse-slow">
        <div className="flex items-center gap-2.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge}`}>{label}</span>
          <span className="text-xs text-brand-700 flex items-center gap-1.5">
            <Spinner />
            {msg}
          </span>
        </div>
      </div>
    )
  }

  // Estado DONE: escala enviada
  if (props.upload) {
    const { upload, onReenviar } = props
    return (
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 transition-all duration-200">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge} shrink-0`}>{label}</span>
          <span className="text-xs font-semibold text-emerald-800 tabular-nums">
            {upload.qtd_linhas ?? '?'} linhas
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-emerald-600 font-medium tabular-nums">✓ {formatTime(upload.created_at)}</span>
          <button
            onClick={() => inputRef.current?.click()}
            title="Reenviar"
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded px-1.5 py-0.5 text-sm transition-all duration-150 cursor-pointer"
          >
            ↺
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.pdf"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) onReenviar(props.tipo, f)
              e.target.value = ''
            }}
            className="hidden"
          />
        </div>
      </div>
    )
  }

  // Estado NOT_SENT: cinza tracejado
  const { onEnviar } = props
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 border border-dashed border-slate-300">
      <div className="flex items-center gap-2.5">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500`}>{label}</span>
        <span className="text-xs text-slate-400">não enviada</span>
      </div>
      <button
        onClick={() => inputRef.current?.click()}
        className="text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 rounded-md px-2.5 py-1 transition-all duration-150 cursor-pointer"
      >
        + Enviar
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.pdf"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onEnviar(props.tipo, f)
          e.target.value = ''
        }}
        className="hidden"
      />
    </div>
  )
}
