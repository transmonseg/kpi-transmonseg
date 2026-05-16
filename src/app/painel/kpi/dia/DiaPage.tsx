'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DropZone } from './DropZone'
import { EscalaItem } from './EscalaItem'

type EscalaUpload = {
  id: string
  tipo: string
  qtd_linhas: number | null
  qtd_orfas: number | null
  created_at: string
}

type Props = {
  data: string
  hoje: string
  escalasIniciais: EscalaUpload[]
  todosTipos: string[]
}

export function DiaPage({ data: dataInicial, hoje, escalasIniciais, todosTipos }: Props) {
  const router = useRouter()
  const [data, setData] = useState(dataInicial)
  const [escalas, setEscalas] = useState<EscalaUpload[]>(escalasIniciais)
  const [uploadingTipos, setUploadingTipos] = useState<Set<string>>(new Set())
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const [loadingEscalas, setLoadingEscalas] = useState(false)

  function formatarData(iso: string): string {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function diaAnterior(): string {
    const d = new Date(data + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  function diaSeguinte(): string {
    const d = new Date(data + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }

  async function navegarPara(novaData: string) {
    setData(novaData)
    router.push(`/painel/kpi/dia?data=${novaData}`)
    setLoadingEscalas(true)
    const res = await fetch(`/api/escalas/dia?data=${novaData}`)
    if (res.ok) setEscalas(await res.json())
    else setEscalas([])
    setLoadingEscalas(false)
  }

  async function uploadArquivo(file: File, tipoExplicito: string) {
    const ext = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'xlsx'
    const contentType = ext === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    const storagePath = `${data}/${tipoExplicito.toLowerCase()}_${Date.now()}.${ext}`

    const { createClient } = await import('@/lib/supabase/client')
    const sb = createClient()
    const { error: storageErr } = await sb.storage
      .from('escalas-raw')
      .upload(storagePath, file, { contentType, upsert: true })
    if (storageErr) throw new Error(storageErr.message)

    const res = await fetch('/api/escalas/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: tipoExplicito.toUpperCase(), data, storagePath }),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  async function recarregarEscalas() {
    const res = await fetch(`/api/escalas/dia?data=${data}`)
    if (res.ok) setEscalas(await res.json())
  }

  async function handleFiles(files: File[]) {
    await Promise.all(files.map(async (file) => {
      const key = 'AUTO_' + file.name + '_' + Date.now()
      setUploadingTipos(prev => new Set([...prev, key]))
      try {
        await uploadArquivo(file, 'auto')
        await recarregarEscalas()
      } catch (e) {
        setUploadErrors(prev => ({ ...prev, [key]: e instanceof Error ? e.message : String(e) }))
      } finally {
        setUploadingTipos(prev => { const s = new Set(prev); s.delete(key); return s })
      }
    }))
  }

  async function handleEnviarTipo(tipo: string, file: File) {
    setUploadingTipos(prev => new Set([...prev, tipo]))
    setUploadErrors(prev => { const e = { ...prev }; delete e[tipo]; return e })
    try {
      await uploadArquivo(file, tipo)
      await recarregarEscalas()
    } catch (e) {
      setUploadErrors(prev => ({ ...prev, [tipo]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setUploadingTipos(prev => { const s = new Set(prev); s.delete(tipo); return s })
    }
  }

  const isHoje = data === hoje
  const dataLabel = formatarData(data)
  const autoUploading = [...uploadingTipos].some(k => k.startsWith('AUTO_'))

  return (
    <div className="max-w-2xl mx-auto">
      {/* Date header */}
      <div className="bg-slate-800 rounded-xl px-5 py-3 flex items-center justify-between gap-4 mb-6 shadow-lg shadow-slate-900/20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navegarPara(diaAnterior())}
            className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer"
          >
            ← {diaAnterior().slice(5).replace('-', '/')}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-sm capitalize">{dataLabel}</span>
            {isHoje && (
              <span className="bg-brand-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                hoje
              </span>
            )}
          </div>
          <button
            onClick={() => navegarPara(diaSeguinte())}
            disabled={isHoje}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 hover:text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer"
          >
            {diaSeguinte().slice(5).replace('-', '/')} →
          </button>
        </div>
        <input
          type="date"
          value={data}
          max={hoje}
          onChange={e => navegarPara(e.target.value)}
          className="bg-slate-700 border border-slate-600 text-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      {/* Escalas card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-4">
        <div className="px-4 pt-4 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Escalas do dia</p>
          <DropZone onFiles={handleFiles} uploading={autoUploading} />
        </div>

        <div className="px-4 pb-4 mt-3 flex flex-col gap-1.5">
          {loadingEscalas ? (
            todosTipos.map(t => (
              <div key={t} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
            ))
          ) : (
            <>
              {escalas.length === 0 && !autoUploading && (
                <p className="text-xs text-slate-400 text-center py-3">
                  Nenhuma escala enviada para este dia. Arraste os arquivos acima.
                </p>
              )}
              {todosTipos.map(tipo => {
                const upload = escalas.find(e => e.tipo === tipo) ?? null
                const uploading = uploadingTipos.has(tipo)
                const erro = uploadErrors[tipo]
                return (
                  <div key={tipo}>
                    {upload ? (
                      <EscalaItem tipo={tipo} upload={upload} onReenviar={handleEnviarTipo} />
                    ) : (
                      <EscalaItem tipo={tipo} upload={null} onEnviar={handleEnviarTipo} uploading={uploading} />
                    )}
                    {erro && (
                      <p className="text-xs text-red-600 mt-1 px-1">{erro}</p>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Erros de upload AUTO */}
        {Object.entries(uploadErrors)
          .filter(([k]) => k.startsWith('AUTO_'))
          .map(([k, msg]) => (
            <div key={k} className="mx-4 mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{msg}</div>
          ))
        }
      </div>
    </div>
  )
}
