'use client'

import { useRef } from 'react'

type EscalaUpload = {
  id: string
  tipo: string
  qtd_linhas: number | null
  qtd_orfas: number | null
  created_at: string
}

type Props =
  | { tipo: string; upload: EscalaUpload; onReenviar: (tipo: string, file: File) => void; uploading?: never }
  | { tipo: string; upload: null; onEnviar: (tipo: string, file: File) => void; uploading?: boolean }

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

export function EscalaItem(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const badge = BADGE_CLASSES[props.tipo] ?? 'bg-slate-100 text-slate-700'
  const label = LABEL[props.tipo] ?? props.tipo

  if (props.upload) {
    const { upload, onReenviar } = props as Extract<Props, { upload: EscalaUpload }>
    return (
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 transition-all duration-200">
        <div className="flex items-center gap-2.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge}`}>{label}</span>
          <span className="text-xs font-semibold text-emerald-800">
            {upload.qtd_linhas ?? '?'} linhas
            {upload.qtd_orfas != null && upload.qtd_orfas > 0 && (
              <span className="text-emerald-600 font-normal"> · {upload.qtd_orfas} sem placa</span>
            )}
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

  const { onEnviar, uploading } = props as Extract<Props, { upload: null }>
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 border border-dashed border-slate-200">
      <div className="flex items-center gap-2.5">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">{label}</span>
        <span className="text-xs text-slate-400">{uploading ? 'Enviando…' : 'não enviada'}</span>
      </div>
      {!uploading && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs font-semibold text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 rounded-md px-2.5 py-1 transition-all duration-150 cursor-pointer"
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
        </>
      )}
    </div>
  )
}
