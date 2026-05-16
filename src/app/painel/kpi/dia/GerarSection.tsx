'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type EscalaUpload = {
  id: string
  tipo: string
  qtd_linhas: number | null
  qtd_orfas: number | null
  created_at: string
}

type ResultadoKpi = {
  rede: string
  kpi_id: string
  xlsx_url: string | null
  pdf_url: string | null
}

type Props = {
  data: string
  escalas: EscalaUpload[]
  todosTipos: string[]
}

const LABEL: Record<string, string> = {
  GERAL:        'GERAL',
  ZONA_SUL:     'ZONA SUL',
  PAX:          'PAX',
  GUANABARA:    'GUANABARA',
  ARMAZEM_GRAO: 'ARMAZÉM DO GRÃO',
}

export function GerarSection({ data, escalas, todosTipos }: Props) {
  const tiposComEscala = todosTipos.filter(t => escalas.some(e => e.tipo === t))
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(tiposComEscala))
  const [unitracFile, setUnitracFile] = useState<File | null>(null)
  const [gerando, setGerando] = useState(false)
  const [progresso, setProgresso] = useState<string>('')
  const [resultado, setResultado] = useState<ResultadoKpi[] | null>(null)
  const [erroGerar, setErroGerar] = useState<string>('')
  const unitracInputRef = useRef<HTMLInputElement>(null)

  function toggleRede(tipo: string) {
    setSelecionados(prev => {
      const s = new Set(prev)
      if (s.has(tipo)) s.delete(tipo); else s.add(tipo)
      return s
    })
  }

  function marcarTodas() { setSelecionados(new Set(tiposComEscala)) }
  function desmarcarTodas() { setSelecionados(new Set()) }

  async function handleGerar() {
    if (!unitracFile || selecionados.size === 0) return
    setGerando(true)
    setErroGerar('')
    setResultado(null)

    try {
      // 1. Upload Unitrac para Storage
      setProgresso('Enviando Unitrac…')
      const ext = unitracFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'xlsx'
      const contentType = ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const storagePath = `${data}/unitrac.${ext}`

      const sb = createClient()
      const { error: storageErr } = await sb.storage
        .from('unitrac-raw')
        .upload(storagePath, unitracFile, { contentType, upsert: true })
      if (storageErr) throw new Error(`Erro ao enviar Unitrac: ${storageErr.message}`)

      // 2. Processar Unitrac (parse e salvar paradas)
      setProgresso('Processando GPS…')
      const unitracRes = await fetch('/api/unitrac/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, storagePath }),
      })
      if (!unitracRes.ok) throw new Error(await unitracRes.text())

      // 3. Para cada rede selecionada: processar + gerar
      const resultados: ResultadoKpi[] = []

      for (const tipo of selecionados) {
        setProgresso(`Processando ${LABEL[tipo] ?? tipo}…`)

        const processarRes = await fetch('/api/kpi/processar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, rede_id: tipo }),
        })
        if (!processarRes.ok) {
          throw new Error(`Erro ao processar ${LABEL[tipo] ?? tipo}: ${await processarRes.text()}`)
        }
        const { kpi_ids } = await processarRes.json() as { kpi_ids: string[] }
        if (!kpi_ids || kpi_ids.length === 0) continue

        for (const kpi_id of kpi_ids) {
          setProgresso(`Gerando XLSX ${LABEL[tipo] ?? tipo}…`)
          const gerarRes = await fetch('/api/kpi/gerar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kpi_id }),
          })

          if (!gerarRes.ok) {
            const text = await gerarRes.text()
            // 409 = anomalias bloqueando - nao abortar, marcar sem URL
            if (gerarRes.status === 409) {
              resultados.push({ rede: tipo, kpi_id, xlsx_url: null, pdf_url: null })
              continue
            }
            throw new Error(`Erro ao gerar ${LABEL[tipo] ?? tipo}: ${text}`)
          }

          const { xlsx_url, pdf_url } = await gerarRes.json() as { xlsx_url: string | null; pdf_url: string | null }
          resultados.push({ rede: tipo, kpi_id, xlsx_url, pdf_url })
        }
      }

      setResultado(resultados)
      setProgresso('')
    } catch (e) {
      setErroGerar(e instanceof Error ? e.message : String(e))
      setProgresso('')
    } finally {
      setGerando(false)
    }
  }

  const podeGerar = unitracFile !== null && selecionados.size > 0 && !gerando

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden shadow-sm shadow-amber-100">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Gerar KPIs</p>
        {tiposComEscala.length > 0 && (
          <div className="flex gap-3">
            <button onClick={marcarTodas} className="text-[11px] text-amber-700 underline underline-offset-2 cursor-pointer">marcar todas</button>
            <button onClick={desmarcarTodas} className="text-[11px] text-amber-700 underline underline-offset-2 cursor-pointer">desmarcar</button>
          </div>
        )}
      </div>

      <div className="px-4 pb-4 flex flex-col gap-3">
        {/* Selecao de redes */}
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
                    <span className="text-[11px] text-slate-400">escala nao enviada</span>
                  )}
                </label>
              )
            })}
          </div>
        )}

        {/* Resultado de geracao */}
        {resultado && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-1">KPIs gerados</p>
            {resultado.map(r => (
              <div key={r.kpi_id} className="flex items-center justify-between px-3 py-2 bg-white border border-emerald-200 rounded-lg">
                <span className="text-xs font-semibold text-emerald-800 flex items-center gap-2">
                  <span className="text-emerald-500">&#10003;</span>
                  {LABEL[r.rede] ?? r.rede}
                </span>
                {r.xlsx_url ? (
                  <a
                    href={r.xlsx_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all duration-150"
                  >
                    &#8595; Baixar XLSX
                  </a>
                ) : (
                  <span className="text-[11px] text-amber-700">Revisar anomalias</span>
                )}
              </div>
            ))}
            <button
              onClick={() => { setResultado(null); setUnitracFile(null) }}
              className="text-xs text-slate-500 underline underline-offset-2 mt-1 cursor-pointer text-left"
            >
              &#8635; Gerar novamente
            </button>
          </div>
        )}

        {/* Unitrac picker */}
        {!resultado && (
          <div className="rounded-lg bg-amber-100 border border-amber-300 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">&#128752;</span>
              <span className="text-xs font-bold text-amber-900">Relatorio Unitrac -- obrigatorio para gerar</span>
            </div>
            {unitracFile ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-emerald-800 flex items-center gap-2">
                  <span>&#128196;</span> {unitracFile.name}
                </span>
                <button
                  onClick={() => setUnitracFile(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
                >
                  &#10005;
                </button>
              </div>
            ) : (
              <div
                onClick={() => unitracInputRef.current?.click()}
                className="border border-dashed border-amber-400 rounded-lg px-3 py-3 text-center cursor-pointer hover:bg-amber-50 transition-all duration-150"
              >
                <p className="text-xs font-semibold text-amber-800">&#128206; Clique para anexar o Unitrac de hoje</p>
                <p className="text-[10px] text-amber-600 mt-0.5">PDF preferido · XLSX aceito · nao fica salvo no sistema</p>
              </div>
            )}
            <input
              ref={unitracInputRef}
              type="file"
              accept=".xlsx,.pdf"
              onChange={e => { const f = e.target.files?.[0]; if (f) setUnitracFile(f); e.target.value = '' }}
              className="hidden"
            />
          </div>
        )}

        {/* Erro de geracao */}
        {erroGerar && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{erroGerar}</div>
        )}

        {/* Botao gerar */}
        {!resultado && (
          <button
            onClick={handleGerar}
            disabled={!podeGerar}
            className={[
              'w-full rounded-xl py-3 text-sm font-bold transition-all duration-200',
              podeGerar
                ? 'bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white shadow-sm shadow-amber-500/30 hover:shadow-md cursor-pointer'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-40',
            ].join(' ')}
          >
            {gerando
              ? `${progresso || 'Gerando...'}`
              : podeGerar
                ? `Gerar ${selecionados.size} KPI${selecionados.size > 1 ? 's' : ''} selecionado${selecionados.size > 1 ? 's' : ''}`
                : unitracFile
                  ? 'Selecione ao menos uma rede para gerar'
                  : 'Anexe o Unitrac para continuar'
            }
          </button>
        )}
      </div>
    </div>
  )
}
