'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DropZone } from './DropZone'

type EscalaUpload = {
  id: string
  tipo: string
  qtd_linhas: number | null
  created_at: string
}

type ResultadoKpi = {
  rede: string
  kpi_id: string
  xlsx_url: string | null
  pdf_url: string | null
  bloqueado?: boolean
}

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

type Step = {
  id: string
  label: string
  status: StepStatus
  detail?: string
}

type Props = {
  data: string
  escalas: EscalaUpload[]
  todosTipos: string[]
  onUnitracSent?: () => void
  traduzErro?: (msg: string) => string
}

const LABEL: Record<string, string> = {
  GERAL:        'GERAL',
  ZONA_SUL:     'ZONA SUL',
  PAX:          'PAX',
  GUANABARA:    'GUANABARA',
  ARMAZEM_GRAO: 'ARMAZÉM DO GRÃO',
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[11px] font-bold shrink-0">
        ✓
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-100 text-brand-700 shrink-0">
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
        </svg>
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[11px] font-bold shrink-0">
        ✕
      </span>
    )
  }
  if (status === 'skipped') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[11px] font-bold shrink-0">
        –
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px] shrink-0">
      ⏳
    </span>
  )
}

export function GerarSection({ data, escalas, todosTipos, onUnitracSent, traduzErro }: Props) {
  const tiposComEscala = useMemo(
    () => todosTipos.filter(t => escalas.some(e => e.tipo === t)),
    [todosTipos, escalas]
  )

  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(tiposComEscala))
  const [unitracFile, setUnitracFile] = useState<File | null>(null)
  const [gerando, setGerando] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [resultado, setResultado] = useState<ResultadoKpi[] | null>(null)
  const [erroGerar, setErroGerar] = useState<string>('')

  const traduz = traduzErro ?? ((m: string) => m)

  function toggleRede(tipo: string) {
    setSelecionados(prev => {
      const s = new Set(prev)
      if (s.has(tipo)) s.delete(tipo); else s.add(tipo)
      return s
    })
  }

  function marcarTodas() { setSelecionados(new Set(tiposComEscala)) }
  function desmarcarTodas() { setSelecionados(new Set()) }

  function setStep(id: string, patch: Partial<Step>) {
    setSteps(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)))
  }

  function handleUnitracDrop(files: File[]) {
    const f = files[0]
    if (f) setUnitracFile(f)
  }

  async function handleGerar() {
    if (!unitracFile || selecionados.size === 0) return
    setGerando(true)
    setErroGerar('')
    setResultado(null)

    const redesSelecionadas = todosTipos.filter(t => selecionados.has(t))
    const initialSteps: Step[] = [
      { id: 'upload_unitrac', label: 'Enviar Unitrac', status: 'pending' },
      { id: 'process_gps', label: 'Processar GPS', status: 'pending' },
      ...redesSelecionadas.flatMap(t => [
        { id: `processar_${t}`, label: `Processar ${LABEL[t] ?? t}`, status: 'pending' as StepStatus },
        { id: `gerar_${t}`, label: `Gerar ${LABEL[t] ?? t}`, status: 'pending' as StepStatus },
      ]),
    ]
    setSteps(initialSteps)

    try {
      // 1. Upload Unitrac para Storage
      setSteps(prev => prev.map(s => s.id === 'upload_unitrac' ? { ...s, status: 'running' } : s))
      const ext = unitracFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'xlsx'
      const contentType = ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const storagePath = `${data}/unitrac.${ext}`

      const sb = createClient()
      const { error: storageErr } = await sb.storage
        .from('unitrac-raw')
        .upload(storagePath, unitracFile, { contentType, upsert: true })
      if (storageErr) {
        setStep('upload_unitrac', { status: 'error' })
        throw new Error(`Erro ao enviar Unitrac: ${storageErr.message}`)
      }
      setStep('upload_unitrac', { status: 'done' })

      // 2. Processar Unitrac (parse e salvar paradas)
      setStep('process_gps', { status: 'running' })
      const unitracRes = await fetch('/api/unitrac/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, storagePath }),
      })
      if (!unitracRes.ok) {
        setStep('process_gps', { status: 'error' })
        throw new Error(await unitracRes.text())
      }
      setStep('process_gps', { status: 'done' })
      onUnitracSent?.()

      // 3. Para cada rede selecionada: processar + gerar
      const resultados: ResultadoKpi[] = []

      for (const tipo of redesSelecionadas) {
        setStep(`processar_${tipo}`, { status: 'running' })

        const processarRes = await fetch('/api/kpi/processar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, rede_id: tipo }),
        })
        if (!processarRes.ok) {
          setStep(`processar_${tipo}`, { status: 'error', detail: traduz(await processarRes.text()) })
          setStep(`gerar_${tipo}`, { status: 'skipped' })
          continue
        }
        const { kpi_ids } = await processarRes.json() as { kpi_ids: string[] }
        setStep(`processar_${tipo}`, { status: 'done' })

        if (!kpi_ids || kpi_ids.length === 0) {
          setStep(`gerar_${tipo}`, { status: 'skipped', detail: 'Sem dados' })
          continue
        }

        setStep(`gerar_${tipo}`, { status: 'running' })
        let geracaoOk = false
        let geracaoBloqueada = false

        for (const kpi_id of kpi_ids) {
          const gerarRes = await fetch('/api/kpi/gerar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kpi_id }),
          })

          if (!gerarRes.ok) {
            const text = await gerarRes.text()
            // 409 = anomalias bloqueando — registra como bloqueado, não aborta
            if (gerarRes.status === 409) {
              resultados.push({ rede: tipo, kpi_id, xlsx_url: null, pdf_url: null, bloqueado: true })
              geracaoBloqueada = true
              continue
            }
            setStep(`gerar_${tipo}`, { status: 'error', detail: traduz(text) })
            throw new Error(`Erro ao gerar ${LABEL[tipo] ?? tipo}: ${text}`)
          }

          const { xlsx_url, pdf_url } = await gerarRes.json() as { xlsx_url: string | null; pdf_url: string | null }
          resultados.push({ rede: tipo, kpi_id, xlsx_url, pdf_url })
          geracaoOk = true
        }

        if (geracaoOk) {
          setStep(`gerar_${tipo}`, { status: 'done', detail: geracaoBloqueada ? 'Parcial — algumas bloqueadas' : undefined })
        } else if (geracaoBloqueada) {
          setStep(`gerar_${tipo}`, { status: 'error', detail: 'Bloqueado por anomalias' })
        }
      }

      setResultado(resultados)
    } catch (e) {
      setErroGerar(traduz(e instanceof Error ? e.message : String(e)))
    } finally {
      setGerando(false)
    }
  }

  function resetar() {
    setResultado(null)
    setUnitracFile(null)
    setSteps([])
    setErroGerar('')
  }

  const podeGerar = unitracFile !== null && selecionados.size > 0 && !gerando

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden shadow-sm shadow-amber-100/60">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Gerar KPIs</p>
        {tiposComEscala.length > 0 && !gerando && !resultado && (
          <div className="flex gap-3">
            <button onClick={marcarTodas} className="text-[11px] text-amber-700 underline underline-offset-2 cursor-pointer">marcar todas</button>
            <button onClick={desmarcarTodas} className="text-[11px] text-amber-700 underline underline-offset-2 cursor-pointer">desmarcar</button>
          </div>
        )}
      </div>

      <div className="px-4 pb-4 flex flex-col gap-3">
        {/* Resultado final */}
        {resultado && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-1">KPIs gerados</p>
            {resultado.length === 0 && (
              <div className="rounded-lg bg-amber-100 border border-amber-300 px-3 py-3 text-xs text-amber-800">
                Nenhum KPI gerado — verifique se há dados para as redes selecionadas.
              </div>
            )}
            {resultado.map(r => (
              <div
                key={r.kpi_id}
                className={[
                  'flex items-center justify-between px-3 py-2 border rounded-lg',
                  r.bloqueado ? 'bg-amber-50 border-amber-300' : 'bg-white border-emerald-200',
                ].join(' ')}
              >
                <span
                  className={[
                    'text-xs font-semibold flex items-center gap-2',
                    r.bloqueado ? 'text-amber-800' : 'text-emerald-800',
                  ].join(' ')}
                >
                  <span className={r.bloqueado ? 'text-amber-500' : 'text-emerald-500'}>
                    {r.bloqueado ? '⚠' : '✓'}
                  </span>
                  {LABEL[r.rede] ?? r.rede}
                  {r.bloqueado && (
                    <span className="text-[11px] font-medium text-amber-700">Bloqueado por anomalias</span>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  {r.bloqueado ? (
                    <Link
                      href="/painel/revisao"
                      className="bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all duration-150"
                    >
                      Revisar →
                    </Link>
                  ) : (
                    <>
                      {r.xlsx_url && (
                        <a
                          href={r.xlsx_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all duration-150"
                        >
                          ↓ XLSX
                        </a>
                      )}
                      {r.pdf_url && (
                        <a
                          href={r.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all duration-150"
                        >
                          ↓ PDF
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <button
              onClick={resetar}
              className="text-xs text-slate-500 underline underline-offset-2 mt-1 cursor-pointer text-left"
            >
              ↻ Gerar novamente
            </button>
          </div>
        )}

        {/* Steps durante geração */}
        {gerando && steps.length > 0 && !resultado && (
          <div className="rounded-lg bg-white border border-amber-200 p-3 flex flex-col gap-1.5">
            {steps.map(step => (
              <div key={step.id} className="flex items-center gap-2.5 text-xs">
                <StepIcon status={step.status} />
                <span
                  className={[
                    'flex-1',
                    step.status === 'done' ? 'text-slate-600' :
                    step.status === 'running' ? 'text-brand-700 font-semibold' :
                    step.status === 'error' ? 'text-red-700 font-semibold' :
                    step.status === 'skipped' ? 'text-slate-400 line-through' :
                    'text-slate-400',
                  ].join(' ')}
                >
                  {step.label}
                </span>
                {step.detail && (
                  <span
                    className={[
                      'text-[10px]',
                      step.status === 'error' ? 'text-red-600' : 'text-slate-500',
                    ].join(' ')}
                  >
                    {step.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Seleção de redes — antes de gerar */}
        {!resultado && !gerando && (
          <>
            {todosTipos.length === 0 ? (
              <p className="text-xs text-amber-600 py-2">Envie ao menos uma escala para gerar KPIs.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {todosTipos.map(tipo => {
                  const temEscala = tiposComEscala.includes(tipo)
                  const checked = selecionados.has(tipo)
                  return (
                    <label
                      key={tipo}
                      className={[
                        'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150',
                        temEscala
                          ? 'bg-white border border-amber-200 hover:bg-amber-50 cursor-pointer'
                          : 'bg-slate-50 border border-dashed border-slate-200 cursor-default opacity-60',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!temEscala}
                        onChange={() => temEscala && toggleRede(tipo)}
                        className="accent-amber-600 w-3.5 h-3.5"
                      />
                      <span className="text-xs font-semibold text-slate-700 flex-1">{LABEL[tipo] ?? tipo}</span>
                      {temEscala ? (
                        <span className="text-[11px] text-amber-700 tabular-nums">
                          {escalas.find(e => e.tipo === tipo)?.qtd_linhas ?? '?'} linhas
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">escala não enviada</span>
                      )}
                    </label>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Unitrac picker — drag & drop */}
        {!resultado && !gerando && (
          <div className="rounded-lg bg-amber-100/60 border border-amber-300 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">🛰️</span>
              <span className="text-xs font-bold text-amber-900">Relatório Unitrac — obrigatório para gerar</span>
            </div>
            {unitracFile ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-emerald-800 flex items-center gap-2 min-w-0">
                  <span className="shrink-0">📄</span>
                  <span className="truncate" title={unitracFile.name}>{unitracFile.name}</span>
                </span>
                <button
                  onClick={() => setUnitracFile(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer shrink-0 ml-2"
                  title="Remover"
                >
                  ✕
                </button>
              </div>
            ) : (
              <DropZone
                onFiles={handleUnitracDrop}
                variant="unitrac"
                hint=".pdf preferido · .xlsx aceito · não fica salvo no sistema"
              />
            )}
          </div>
        )}

        {/* Erro de geração */}
        {erroGerar && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start justify-between gap-2">
            <span className="flex-1">{erroGerar}</span>
            <button
              onClick={() => setErroGerar('')}
              className="text-red-500 hover:text-red-700 cursor-pointer shrink-0"
              title="Dispensar"
            >
              ✕
            </button>
          </div>
        )}

        {/* Botão gerar */}
        {!resultado && !gerando && (
          <button
            onClick={handleGerar}
            disabled={!podeGerar}
            className={[
              'w-full rounded-xl py-3 text-sm font-bold transition-all duration-200',
              podeGerar
                ? 'bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white shadow-sm shadow-amber-500/30 hover:shadow-md cursor-pointer'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60',
            ].join(' ')}
          >
            {podeGerar
              ? `⚡ Gerar ${selecionados.size} KPI${selecionados.size > 1 ? 's' : ''} selecionado${selecionados.size > 1 ? 's' : ''}`
              : !unitracFile
                ? 'Anexe o Unitrac para continuar'
                : 'Selecione ao menos uma rede para gerar'
            }
          </button>
        )}
      </div>
    </div>
  )
}
