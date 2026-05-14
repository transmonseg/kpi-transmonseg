'use client'

import { useMemo, useState, useTransition } from 'react'

type Status = 'completa' | 'sem-placa' | 'sem-motorista' | 'vazia'

type Rota = {
  rota: string
  motorista: string
  placa: string
  veiculo: string
  status: Status
  duplicada: boolean
}

type Estatisticas = {
  total: number
  completas: number
  semPlaca: number
  semMotorista: number
  vazias: number
  duplicadas: number
}

type Resultado = {
  rotas: Rota[]
  estatisticas: Estatisticas
  xlsxBase64: string
  pdfBase64: string
  nomeBase: string
}

const SEM_VALOR = '—'

export function CozinhaUploader() {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [dataRef, setDataRef] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [rotasEditadas, setRotasEditadas] = useState<Rota[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [pendingRegen, startRegen] = useTransition()
  const [filtro, setFiltro] = useState<'todas' | 'problemas' | 'completas'>('todas')

  async function processar() {
    if (!arquivo) {
      setErro('Selecione um arquivo XLSX.')
      return
    }
    setErro(null)
    setResultado(null)
    setRotasEditadas(null)

    const fd = new FormData()
    fd.append('arquivo', arquivo)
    fd.append('dataRef', dataRef)

    startTransition(async () => {
      try {
        const res = await fetch('/api/cozinha', { method: 'POST', body: fd })
        if (!res.ok) throw new Error((await res.text()) || 'Erro ao processar.')
        const data = (await res.json()) as Resultado
        setResultado(data)
        setRotasEditadas(data.rotas)
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
      }
    })
  }

  async function salvarEdicoes() {
    if (!rotasEditadas || !resultado) return
    setErro(null)
    const dataFormatada = formatarDataPtBr(dataRef)

    startRegen(async () => {
      try {
        const res = await fetch('/api/cozinha/regenerar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rotas: rotasEditadas,
            dataRef: dataFormatada,
            nomeBase: resultado.nomeBase,
          }),
        })
        if (!res.ok) throw new Error((await res.text()) || 'Erro ao regenerar.')
        const data = (await res.json()) as Resultado
        setResultado(data)
        setRotasEditadas(data.rotas)
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
      }
    })
  }

  function editarCelula(idx: number, campo: 'motorista' | 'placa', valor: string) {
    if (!rotasEditadas) return
    const novas = [...rotasEditadas]
    novas[idx] = { ...novas[idx], [campo]: valor }
    setRotasEditadas(novas)
  }

  function baixar(base64: string, nome: string, mime: string) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const blob = new Blob([new Uint8Array(bytes)], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const dataFormatada = formatarDataPtBr(dataRef)
  const editou = useMemo(() => {
    if (!rotasEditadas || !resultado) return false
    return rotasEditadas.some(
      (r, i) =>
        r.motorista !== resultado.rotas[i]?.motorista ||
        r.placa !== resultado.rotas[i]?.placa
    )
  }, [rotasEditadas, resultado])

  const rotasFiltradas = useMemo(() => {
    if (!rotasEditadas) return []
    if (filtro === 'todas') return rotasEditadas
    if (filtro === 'completas')
      return rotasEditadas.filter(r => r.status === 'completa')
    return rotasEditadas.filter(r => r.status !== 'completa')
  }, [rotasEditadas, filtro])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-ink mb-4">Upload da escala</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Arquivo XLSX
            </label>
            <label className="flex flex-col items-center justify-center w-full h-32 rounded-lg border-2 border-dashed border-border-strong bg-surface-alt hover:bg-brand-50 hover:border-brand-400 transition cursor-pointer text-center px-4">
              <svg
                className="h-7 w-7 text-ink-muted mb-2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-sm text-ink font-medium">
                {arquivo ? arquivo.name : 'Clique para selecionar'}
              </span>
              <span className="text-xs text-ink-soft mt-0.5">Apenas .xlsx</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={e => setArquivo(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Data de referência
            </label>
            <input
              type="date"
              value={dataRef}
              onChange={e => setDataRef(e.target.value)}
              className="w-full rounded-lg border border-border-strong bg-white px-3.5 py-2.5 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
            />
            <p className="mt-1.5 text-xs text-ink-soft">
              Aparece no cabeçalho do XLSX e PDF gerados.
            </p>
          </div>
        </div>

        {erro && (
          <div className="mt-5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
            {erro}
          </div>
        )}

        <button
          onClick={processar}
          disabled={pending || !arquivo}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition shadow-sm shadow-brand-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? (
            <>
              <Spinner className="mr-2" />
              Processando...
            </>
          ) : (
            'Processar escala'
          )}
        </button>
      </div>

      {resultado && rotasEditadas && (
        <>
          {/* Alertas */}
          <AlertasResumo estatisticas={resultado.estatisticas} />

          {/* Tabela editável + downloads */}
          <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-ink">Rotas</h2>
                <FiltroChips filtro={filtro} setFiltro={setFiltro} stats={resultado.estatisticas} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {editou && (
                  <button
                    onClick={salvarEdicoes}
                    disabled={pendingRegen}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition shadow-sm disabled:opacity-50"
                  >
                    {pendingRegen ? (
                      <>
                        <Spinner />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <IconSave />
                        Salvar edições
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() =>
                    baixar(
                      resultado.xlsxBase64,
                      `${resultado.nomeBase}_LIMPO.xlsx`,
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    )
                  }
                  disabled={editou}
                  title={editou ? 'Salve as edições primeiro' : ''}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition shadow-sm shadow-brand-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <IconDownload />
                  XLSX
                </button>
                <button
                  onClick={() =>
                    baixar(
                      resultado.pdfBase64,
                      `${resultado.nomeBase}_LIMPO.pdf`,
                      'application/pdf'
                    )
                  }
                  disabled={editou}
                  title={editou ? 'Salve as edições primeiro' : ''}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:bg-surface-hover transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <IconDownload />
                  PDF
                </button>
              </div>
            </div>

            <div className="px-6 py-3 bg-brand-50 border-b border-border text-xs text-ink-soft">
              Clique em qualquer célula de motorista ou placa para editar.
              {editou && (
                <span className="ml-2 font-semibold text-amber-700">
                  Você tem alterações não salvas.
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-600 text-white">
                    <th className="px-4 py-3 text-left font-semibold w-12">#</th>
                    <th className="px-4 py-3 text-left font-semibold">Rota</th>
                    <th className="px-4 py-3 text-left font-semibold">Motorista</th>
                    <th className="px-4 py-3 text-left font-semibold w-32">Placa</th>
                    <th className="px-4 py-3 text-left font-semibold w-28">Veículo</th>
                    <th className="px-4 py-3 text-center font-semibold w-32">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rotasFiltradas.map(r => {
                    const idx = rotasEditadas.indexOf(r)
                    return (
                      <tr
                        key={idx}
                        className={idx % 2 === 1 ? 'bg-surface-alt' : 'bg-white'}
                      >
                        <td className="px-4 py-2 text-ink-soft">{idx + 1}</td>
                        <td className="px-4 py-2 text-ink font-medium">
                          {r.rota}
                          {r.duplicada && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
                              DUP
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <CelulaEditavel
                            valor={r.motorista}
                            onChange={v => editarCelula(idx, 'motorista', v)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <CelulaEditavel
                            valor={r.placa}
                            onChange={v => editarCelula(idx, 'placa', v)}
                            monospace
                          />
                        </td>
                        <td className="px-4 py-2 text-ink-soft text-xs">{r.veiculo}</td>
                        <td className="px-4 py-2 text-center">
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    )
                  })}
                  {rotasFiltradas.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                        Nenhuma rota nesse filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function AlertasResumo({ estatisticas }: { estatisticas: Estatisticas }) {
  const itens = [
    {
      label: 'Total',
      valor: estatisticas.total,
      cor: 'bg-brand-50 text-brand-700 border-brand-200',
    },
    {
      label: 'Completas',
      valor: estatisticas.completas,
      cor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      label: 'Sem placa',
      valor: estatisticas.semPlaca,
      cor:
        estatisticas.semPlaca > 0
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-slate-50 text-slate-500 border-slate-200',
    },
    {
      label: 'Sem motorista',
      valor: estatisticas.semMotorista,
      cor:
        estatisticas.semMotorista > 0
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-slate-50 text-slate-500 border-slate-200',
    },
    {
      label: 'Vazias',
      valor: estatisticas.vazias,
      cor:
        estatisticas.vazias > 0
          ? 'bg-slate-100 text-slate-600 border-slate-300'
          : 'bg-slate-50 text-slate-500 border-slate-200',
    },
    {
      label: 'Duplicadas',
      valor: estatisticas.duplicadas,
      cor:
        estatisticas.duplicadas > 0
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-slate-50 text-slate-500 border-slate-200',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {itens.map(it => (
        <div
          key={it.label}
          className={`rounded-xl border ${it.cor} px-4 py-3`}
        >
          <div className="text-2xl font-bold leading-tight">{it.valor}</div>
          <div className="text-[11px] font-semibold uppercase tracking-wider mt-1 opacity-80">
            {it.label}
          </div>
        </div>
      ))}
    </div>
  )
}

function FiltroChips({
  filtro,
  setFiltro,
  stats,
}: {
  filtro: 'todas' | 'problemas' | 'completas'
  setFiltro: (f: 'todas' | 'problemas' | 'completas') => void
  stats: Estatisticas
}) {
  const problemas = stats.semPlaca + stats.semMotorista + stats.vazias
  const opts: { id: typeof filtro; label: string; count: number }[] = [
    { id: 'todas', label: 'Todas', count: stats.total },
    { id: 'problemas', label: 'Com problemas', count: problemas },
    { id: 'completas', label: 'Completas', count: stats.completas },
  ]
  return (
    <div className="flex gap-1">
      {opts.map(o => (
        <button
          key={o.id}
          onClick={() => setFiltro(o.id)}
          className={
            filtro === o.id
              ? 'px-2.5 py-1 rounded-md text-xs font-semibold bg-brand-600 text-white'
              : 'px-2.5 py-1 rounded-md text-xs font-semibold bg-surface-hover text-ink-soft hover:bg-brand-50 hover:text-brand-700'
          }
        >
          {o.label} <span className="opacity-70">({o.count})</span>
        </button>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const cfg = {
    completa: { label: 'OK', cls: 'bg-emerald-100 text-emerald-700' },
    'sem-placa': { label: 'SEM PLACA', cls: 'bg-amber-100 text-amber-700' },
    'sem-motorista': { label: 'SEM MOT.', cls: 'bg-amber-100 text-amber-700' },
    vazia: { label: 'VAZIA', cls: 'bg-slate-200 text-slate-600' },
  }[status]
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function CelulaEditavel({
  valor,
  onChange,
  monospace,
}: {
  valor: string
  onChange: (v: string) => void
  monospace?: boolean
}) {
  const vazio = !valor || valor === SEM_VALOR
  return (
    <input
      value={vazio ? '' : valor}
      placeholder={SEM_VALOR}
      onChange={e => onChange(e.target.value)}
      className={
        `w-full px-2 py-1.5 rounded border text-sm bg-transparent ` +
        `border-transparent hover:border-border-strong hover:bg-white ` +
        `focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition ` +
        (monospace ? 'font-mono text-xs ' : '') +
        (vazio ? 'text-ink-muted italic' : 'text-ink')
      }
    />
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

function IconDownload() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function IconSave() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  )
}

function formatarDataPtBr(iso: string): string {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return ''
  return `${d}/${m}/${a}`
}
