'use client'

import { useRef, useState, useTransition } from 'react'

type EscalaResult = { upload_id: string; qtd_linhas: number; qtd_orfas: number }
type UnitracResult = { upload_id: string; qtd_abas: number; qtd_paradas: number }
type CardState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'ok'; payload: EscalaResult | UnitracResult }
  | { status: 'conflict'; message: string }
  | { status: 'error'; message: string }

function useUploadCard() {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [data, setData] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [state, setState] = useState<CardState>({ status: 'idle' })
  const [pending, start] = useTransition()
  return { arquivo, setArquivo, data, setData, state, setState, pending, start }
}

async function uploadEscala(
  arquivo: File,
  data: string,
  tipo: string,
  replace: boolean,
): Promise<EscalaResult> {
  const fd = new FormData()
  fd.append('arquivo', arquivo)
  fd.append('data', data)
  fd.append('tipo', tipo)
  fd.append('replace', String(replace))
  const res = await fetch('/api/escalas/upload', { method: 'POST', body: fd })
  if (!res.ok) {
    const text = await res.text()
    const err = new Error(text || 'Erro ao enviar.')
    ;(err as Error & { status: number }).status = res.status
    throw err
  }
  return res.json()
}

async function uploadUnitrac(
  arquivo: File,
  data: string,
  replace: boolean,
): Promise<UnitracResult> {
  const fd = new FormData()
  fd.append('arquivo', arquivo)
  fd.append('data', data)
  fd.append('replace', String(replace))
  const res = await fetch('/api/unitrac/upload', { method: 'POST', body: fd })
  if (!res.ok) {
    const text = await res.text()
    const err = new Error(text || 'Erro ao enviar.')
    ;(err as Error & { status: number }).status = res.status
    throw err
  }
  return res.json()
}

function isConflict(e: unknown): boolean {
  return (e as Error & { status?: number })?.status === 409
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FileZone({
  arquivo,
  onChange,
}: {
  arquivo: File | null
  onChange: (f: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="flex flex-col items-center justify-center w-full h-24 rounded-lg border-2 border-dashed border-border-strong bg-surface-alt hover:bg-brand-50 hover:border-brand-400 transition cursor-pointer text-center px-3 select-none"
    >
      <svg className="h-5 w-5 text-ink-muted mb-1 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <span className="text-xs font-medium text-ink leading-tight pointer-events-none">
        {arquivo ? arquivo.name : 'Clique para selecionar'}
      </span>
      <span className="text-[10px] text-ink-soft mt-0.5 pointer-events-none">.xlsx</span>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={e => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
    </div>
  )
}

function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
    />
  )
}

function StatusArea({ state, onReplace }: { state: CardState; onReplace: () => void }) {
  if (state.status === 'idle') return null

  if (state.status === 'uploading') {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-soft">
        <Spinner /> Enviando…
      </div>
    )
  }

  if (state.status === 'ok') {
    const p = state.payload
    const isUnitrac = 'qtd_abas' in p
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800 font-medium">
        Enviado com sucesso.{' '}
        {isUnitrac
          ? `${(p as UnitracResult).qtd_abas} veículos · ${(p as UnitracResult).qtd_paradas} paradas`
          : `${(p as EscalaResult).qtd_linhas} linhas · ${(p as EscalaResult).qtd_orfas} sem placa`}
      </div>
    )
  }

  if (state.status === 'conflict') {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 space-y-1.5">
        <p>{state.message}</p>
        <button
          onClick={onReplace}
          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700"
        >
          Sobrescrever mesmo assim
        </button>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
        {state.message}
      </div>
    )
  }

  return null
}

// ─── Upload cards ──────────────────────────────────────────────────────────────

function EscalaCard({ tipo, label, desc }: { tipo: string; label: string; desc: string }) {
  const { arquivo, setArquivo, data, setData, state, setState, pending, start } = useUploadCard()

  function doUpload(replace = false) {
    if (!arquivo) return
    setState({ status: 'uploading' })
    start(async () => {
      try {
        const res = await uploadEscala(arquivo, data, tipo, replace)
        setState({ status: 'ok', payload: res })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (isConflict(e)) {
          setState({ status: 'conflict', message: msg })
        } else {
          setState({ status: 'error', message: msg })
        }
      }
    })
  }

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-100 text-brand-700">
            {tipo}
          </span>
          <h3 className="font-semibold text-ink text-sm">{label}</h3>
        </div>
        <p className="text-xs text-ink-soft">{desc}</p>
      </div>

      <FileZone arquivo={arquivo} onChange={setArquivo} />

      <div>
        <label className="block text-xs font-medium text-ink-soft mb-1">Data da escala</label>
        <DateField value={data} onChange={setData} />
      </div>

      <StatusArea state={state} onReplace={() => doUpload(true)} />

      <button
        onClick={() => doUpload(false)}
        disabled={!arquivo || pending || state.status === 'uploading'}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition shadow-sm shadow-brand-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending || state.status === 'uploading' ? (
          <><Spinner className="mr-1" /> Enviando…</>
        ) : (
          'Enviar escala'
        )}
      </button>
    </div>
  )
}

function UnitracCard() {
  const { arquivo, setArquivo, data, setData, state, setState, pending, start } = useUploadCard()

  function doUpload(replace = false) {
    if (!arquivo) return
    setState({ status: 'uploading' })
    start(async () => {
      try {
        const res = await uploadUnitrac(arquivo, data, replace)
        setState({ status: 'ok', payload: res })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (isConflict(e)) {
          setState({ status: 'conflict', message: msg })
        } else {
          setState({ status: 'error', message: msg })
        }
      }
    })
  }

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
            GPS
          </span>
          <h3 className="font-semibold text-ink text-sm">Relatório Unitrac</h3>
        </div>
        <p className="text-xs text-ink-soft">
          Relatório de paradas exportado do Unitrac. Uma aba por veículo.
        </p>
      </div>

      <FileZone arquivo={arquivo} onChange={setArquivo} />

      <div>
        <label className="block text-xs font-medium text-ink-soft mb-1">Data do relatório</label>
        <DateField value={data} onChange={setData} />
      </div>

      <StatusArea state={state} onReplace={() => doUpload(true)} />

      <button
        onClick={() => doUpload(false)}
        disabled={!arquivo || pending || state.status === 'uploading'}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending || state.status === 'uploading' ? (
          <><Spinner className="mr-1" /> Enviando…</>
        ) : (
          'Enviar Unitrac'
        )}
      </button>
    </div>
  )
}

// ─── Root ──────────────────────────────────────────────────────────────────────

export function Uploaders() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wider mb-3">
          Escalas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <EscalaCard
            tipo="GERAL"
            label="Escala Geral"
            desc="Assaí, Sendas e demais redes. Abas por dia."
          />
          <EscalaCard
            tipo="ZONA_SUL"
            label="Escala Zona Sul"
            desc="Aba MATRIZ. Carregamentos D/D+1 por horário e filial."
          />
          <EscalaCard
            tipo="PAX"
            label="Escala PAX"
            desc="Super Pax, Feira Nova e Rede Emanuel. Abas por dia."
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wider mb-3">
          GPS / Rastreamento
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UnitracCard />
        </div>
      </div>
    </div>
  )
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin h-4 w-4 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}
