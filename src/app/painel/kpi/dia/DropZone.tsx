'use client'

import { useRef, useState } from 'react'
import { UploadSimple, CircleNotch } from '@phosphor-icons/react/dist/ssr'
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

  const subtitle = hint ?? '.xlsx ou .pdf — detecta o tipo automaticamente'

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
        <CircleNotch
          size={22}
          weight="bold"
          className="animate-spin text-[var(--color-accent)] mb-2 pointer-events-none"
        />
      ) : (
        <UploadSimple
          size={22}
          weight="bold"
          className={cn(
            'mb-2 pointer-events-none transition-colors',
            dragging ? 'text-[var(--color-accent)]' : 'text-[var(--color-fg-subtle)]',
          )}
        />
      )}
      <p className="text-sm font-semibold pointer-events-none text-[var(--color-fg)]">
        {uploading ? titleUploading : titleIdle}
      </p>
      <p className="text-xs mt-1 pointer-events-none text-[var(--color-fg-muted)]">
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
