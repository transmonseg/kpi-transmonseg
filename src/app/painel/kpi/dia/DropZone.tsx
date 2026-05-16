'use client'

import { useRef, useState } from 'react'

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

  const titleIdle = variant === 'unitrac'
    ? 'Arraste o Unitrac aqui ou clique'
    : 'Arraste arquivos aqui ou clique'

  const titleUploading = uploadingCount && uploadingCount > 1
    ? `Enviando ${uploadingCount} arquivos…`
    : 'Enviando…'

  const subtitle = hint ?? '.xlsx · .pdf — detecta o tipo automaticamente'

  return (
    <div
      onClick={() => !disabled && !uploading && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); if (!disabled && !uploading) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        if (!disabled && !uploading) handleFiles(e.dataTransfer.files)
      }}
      className={[
        'flex flex-col items-center justify-center w-full py-6 rounded-xl border-2 transition-all duration-200 select-none text-center px-4',
        dragging
          ? 'border-solid border-brand-500 bg-brand-100 ring-2 ring-brand-200'
          : uploading
            ? 'border-dashed border-brand-300 bg-brand-50/70'
            : 'border-dashed border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50 cursor-pointer',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
        uploading ? 'cursor-wait' : '',
      ].join(' ')}
    >
      {uploading ? (
        <svg className="animate-spin h-5 w-5 text-brand-500 mb-2 pointer-events-none" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
        </svg>
      ) : (
        <svg
          className={[
            'h-6 w-6 mb-2 pointer-events-none transition-colors duration-200',
            dragging ? 'text-brand-600' : 'text-slate-400',
          ].join(' ')}
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
      <p className={[
        'text-sm font-semibold pointer-events-none transition-colors duration-200',
        uploading ? 'text-brand-700' : dragging ? 'text-brand-700' : 'text-slate-700',
      ].join(' ')}>
        {uploading ? titleUploading : titleIdle}
      </p>
      <p className={[
        'text-xs mt-1 pointer-events-none',
        uploading ? 'text-brand-500' : 'text-slate-500',
      ].join(' ')}>
        {subtitle}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.pdf"
        multiple={variant === 'escalas'}
        onChange={e => handleFiles(e.target.files)}
        className="hidden"
      />
    </div>
  )
}
