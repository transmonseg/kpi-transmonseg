'use client'

import { useRef, useState } from 'react'

type Props = {
  onFiles: (files: File[]) => void
  disabled?: boolean
  uploading?: boolean
}

export function DropZone({ onFiles, disabled, uploading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    onFiles(Array.from(files))
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        if (!disabled) handleFiles(e.dataTransfer.files)
      }}
      className={[
        'flex flex-col items-center justify-center w-full py-6 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer select-none text-center px-4',
        dragging
          ? 'border-brand-500 bg-brand-100'
          : 'border-brand-200 bg-brand-50 hover:border-brand-400 hover:bg-brand-100',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
      ].join(' ')}
    >
      {uploading ? (
        <svg className="animate-spin h-5 w-5 text-brand-400 mb-2 pointer-events-none" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
        </svg>
      ) : (
        <svg className="h-6 w-6 text-brand-400 mb-2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      )}
      <p className="text-sm font-semibold text-brand-700 pointer-events-none">
        {uploading ? 'Enviando…' : 'Arraste ou clique para enviar escalas'}
      </p>
      <p className="text-xs text-brand-400 mt-1 pointer-events-none">
        XLSX ou PDF — detecta o tipo automaticamente
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.pdf"
        multiple
        onChange={e => handleFiles(e.target.files)}
        className="hidden"
      />
    </div>
  )
}
