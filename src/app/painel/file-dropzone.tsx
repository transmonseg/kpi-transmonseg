'use client'

import { useCallback, useRef, useState } from 'react'
import { UploadSimple, FilePdf, FileXls, X } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/components/ui'

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

export function FileDropzone({ className, eyebrow, label, hint, accept, multiple, files, onAdd, onRemove }: FileDropzoneProps) {
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
          'group relative flex min-h-[170px] cursor-pointer flex-col justify-between gap-4 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-bg-elevated)] p-5 shadow-soft u-motion',
          dragging
            ? 'scale-[1.015] shadow-[0_0_0_3px_var(--color-accent),0_16px_40px_-12px_rgba(31,56,100,0.45)]'
            : hasFiles
              ? 'shadow-[0_0_0_1.5px_var(--color-success),var(--shadow-soft)]'
              : 'hover:-translate-y-0.5 hover:shadow-diffusion'
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
            <div className="text-[13px] font-medium text-[var(--color-fg-muted)]">{eyebrow}</div>
            <h3 className="mt-1 text-[19px] font-semibold tracking-[-0.015em] text-[var(--color-fg)]">{label}</h3>
            <p className="mt-1 text-[13px] leading-snug text-[var(--color-fg-muted)]">{hint}</p>
          </div>
          {!hasFiles && (
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] u-motion group-hover:bg-[var(--color-accent-soft)] group-hover:text-[var(--color-accent)]">
              <UploadSimple size={16} weight="bold" />
            </span>
          )}
        </div>

        {!hasFiles && (
          <p className="text-[13px] text-[var(--color-fg-subtle)]">
            Arraste o arquivo aqui ou <span className="font-medium text-[var(--color-accent)]">escolha no computador</span>
          </p>
        )}

        {hasFiles && (
          <ul className="flex flex-col gap-1.5">
            {files.map((f, i) => (
              <li
                key={f.name + i}
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-2 rounded-[10px] bg-[var(--color-bg-subtle)] px-3 py-2"
              >
                {f.name.toLowerCase().endsWith('.pdf') ? (
                  <FilePdf size={16} weight="bold" className="shrink-0 text-[var(--color-danger)]" />
                ) : (
                  <FileXls size={16} weight="bold" className="shrink-0 text-[var(--color-success)]" />
                )}
                <span className="flex-1 truncate text-[12.5px] font-medium text-[var(--color-fg)]">
                  {f.name}
                </span>
                <span className="num text-[12px] text-[var(--color-fg-subtle)]">
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
