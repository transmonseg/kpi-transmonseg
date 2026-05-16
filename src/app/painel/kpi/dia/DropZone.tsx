'use client'

import { useRef, useState } from 'react'
import { cn } from '@/components/ui'

type Props = {
  onFiles: (files: File[]) => void
  disabled?: boolean
  uploading?: boolean
  uploadingCount?: number
  variant?: 'escalas' | 'unitrac'
  hint?: string
}

export function DropZone({
  onFiles,
  disabled,
  uploading,
  uploadingCount,
  variant = 'escalas',
  hint,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    onFiles(Array.from(files))
    if (inputRef.current) inputRef.current.value = ''
  }

  const titleIdle =
    variant === 'unitrac'
      ? 'Arraste o Unitrac aqui ou clique'
      : 'Arraste arquivos aqui ou clique'

  const titleUploading =
    uploadingCount && uploadingCount > 1
      ? `Enviando ${uploadingCount} arquivos…`
      : 'Enviando…'

  const subtitle = hint ?? '.xlsx · .pdf — detecta o tipo automaticamente'

  const stateClass = dragging
    ? 'border-solid border-[var(--color-accent)] bg-[var(--color-accent-soft)]/40 ring-2 ring-[var(--color-accent)]/30'
    : uploading
      ? 'border-dashed border-[var(--color-accent)]/60 bg-[var(--color-bg-subtle)]'
      : 'border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] hover:border-[var(--color-accent)]/70 hover:bg-[var(--color-bg-hover)] cursor-pointer'

  return (
    <div
      onClick={() => !disabled && !uploading && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled && !uploading) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (!disabled && !uploading) handleFiles(e.dataTransfer.files)
      }}
      className={cn(
        'flex flex-col items-center justify-center w-full py-6 px-4',
        'rounded-lg border text-center select-none transition-colors',
        stateClass,
        disabled && 'opacity-40 cursor-not-allowed',
        uploading && 'cursor-wait',
      )}
    >
      {uploading ? (
        <svg
          className="animate-spin h-5 w-5 text-[var(--color-accent)] mb-2 pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
        </svg>
      ) : (
        <svg
          className={cn(
            'h-6 w-6 mb-2 pointer-events-none transition-colors',
            dragging ? 'text-[var(--color-accent)]' : 'text-[var(--color-fg-subtle)]',
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      )}
      <p
        className={cn(
          'text-sm font-semibold pointer-events-none transition-colors',
          uploading || dragging
            ? 'text-[var(--color-fg)]'
            : 'text-[var(--color-fg)]',
        )}
      >
        {uploading ? titleUploading : titleIdle}
      </p>
      <p
        className={cn(
          'text-xs mt-1 pointer-events-none',
          'text-[var(--color-fg-muted)]',
        )}
      >
        {subtitle}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.pdf"
        multiple={variant === 'escalas'}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
    </div>
  )
}
