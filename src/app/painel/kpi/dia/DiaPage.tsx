'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
    const res = await fetch(`/api/escalas/dia?data=${novaData}`)
    if (res.ok) setEscalas(await res.json())
    else setEscalas([])
  }

  const isHoje = data === hoje
  const dataLabel = formatarData(data)

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

      {/* Placeholder — substituído nas Tasks 4 e 5 */}
      <div className="text-sm text-slate-400 p-4">
        {escalas.length} escala(s) para {data}. Drop zone e lista chegam na próxima task.
      </div>
    </div>
  )
}
